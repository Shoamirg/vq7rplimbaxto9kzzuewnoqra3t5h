import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_state.dart';
import '../data/accounts.dart';
import '../data/api_client.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../l10n/l10n.dart';
import 'customers.dart' show phoneError;
import 'forgot_password.dart';
import 'settings.dart';
import 'sign_in.dart';

/// Customer self sign-up: phone & email → SMS code → password → garage
/// (only when the phone is not linked to a garage yet).
class SignUpScreen extends StatefulWidget {
  const SignUpScreen({super.key, required this.state});
  final AppState state;
  @override
  State<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends State<SignUpScreen> {
  late final AccountSource source = widget.state.accounts;
  final form = GlobalKey<FormState>();
  final phone = TextEditingController(text: '+998 '),
      email = TextEditingController(),
      code = TextEditingController(),
      password = TextEditingController();
  int step = 1;
  bool busy = false, obscure = true, needsGarage = true;
  List<GarageChoice>? garages;
  String? garageId, error;

  @override
  void dispose() {
    phone.dispose();
    email.dispose();
    code.dispose();
    password.dispose();
    super.dispose();
  }

  int get steps => needsGarage ? 4 : 3;

  Future<void> next() async {
    if (!validateForm(form)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      switch (step) {
        case 1:
          await source.startSignUp(phone: phone.text, email: email.text.trim());
        case 2:
          if (code.text.length != 6) throw const AppFailure(wrongCode);
          needsGarage = await source.verifySignUp(code.text);
          if (needsGarage) garages = await source.garages();
        case 3 when needsGarage:
          break;
        default:
          if (needsGarage && garageId == null) {
            throw const AppFailure('Bu maydonni toʻldiring.');
          }
          await source.completeSignUp(
            password: password.text,
            garageId: garageId,
          );
          await finish();
          return;
      }
      if (mounted) setState(() => step++);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> finish() async {
    if (!mounted) return;
    await openPage(context, NotificationsScreen(state: widget.state));
    if (!mounted) return;
    widget.state.demo(DemoRole.customer);
    enterApp(context);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final (title, detail) = switch (step) {
      1 => (context.l10n.signUpPhoneTitle, context.l10n.signUpPhoneHint),
      2 => (context.l10n.enterCode, context.l10n.codeSentTo(phone.text.trim())),
      3 => (context.l10n.signUpPasswordTitle, context.l10n.passwordRule),
      _ => (context.l10n.chooseGarage, context.l10n.chooseGarageHint),
    };
    return PageFrame(
      title: context.l10n.createAccount,
      demo: source.isDemo,
      hasChanges: step > 1 && !busy,
      isSaving: busy,
      body: Form(
        key: form,
        child: ListView(
          padding: const EdgeInsets.all(Space.page),
          children: [
            StepHeader(step: step, of: steps, title: title, detail: detail),
            if (error != null) ErrorNotice(error!),
            if (step == 1) ...[
              TextFormField(
                controller: phone,
                enabled: !busy,
                keyboardType: TextInputType.phone,
                autofillHints: const [AutofillHints.telephoneNumber],
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[\d+\s]')),
                ],
                style: context.mono(size: 16),
                decoration: InputDecoration(
                  labelText: context.l10n.phone,
                  prefixIcon: const Icon(Icons.phone_outlined),
                ),
                validator: (value) => context.validation(
                  value?.replaceAll(RegExp(r'\D'), '').startsWith('998') ==
                          true
                      ? phoneError(value)
                      : 'Toʻgʻri telefon raqamini kiriting.',
                ),
              ),
              const SizedBox(height: Space.md),
              TextFormField(
                controller: email,
                enabled: !busy,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                decoration: InputDecoration(
                  labelText: context.l10n.email,
                  prefixIcon: const Icon(Icons.alternate_email),
                ),
                validator: (s) =>
                    RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(s?.trim() ?? '')
                    ? null
                    : context.l10n.emailError,
              ),
            ],
            if (step == 2) ...[
              OtpField(
                controller: code,
                label: context.l10n.smsCode,
                enabled: !busy,
              ),
              ResendTimer(
                onResend: () => source.startSignUp(
                  phone: phone.text,
                  email: email.text.trim(),
                ),
              ),
            ],
            if (step == 3)
              TextFormField(
                controller: password,
                enabled: !busy,
                obscureText: obscure,
                autofillHints: const [AutofillHints.newPassword],
                decoration: InputDecoration(
                  labelText: context.l10n.password,
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    tooltip: obscure
                        ? context.l10n.showPassword
                        : context.l10n.hidePassword,
                    onPressed: () => setState(() => obscure = !obscure),
                    icon: Icon(
                      obscure
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
                validator: (s) => (s?.length ?? 0) >= 10
                    ? null
                    : context.l10n.passwordRule,
              ),
            if (step == 4)
              for (final garage in garages ?? const <GarageChoice>[])
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.md),
                  child: BentoCard(
                    padding: const EdgeInsets.all(Space.tile),
                    borderColor: garageId == garage.id ? p.brand : null,
                    semanticLabel: garage.name,
                    onTap: busy
                        ? null
                        : () => setState(() => garageId = garage.id),
                    child: Row(
                      children: [
                        IconSquare(Icons.home_repair_service_outlined),
                        const SizedBox(width: Space.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                garage.name,
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                              Text(
                                garage.address,
                                style: TextStyle(color: p.secondary),
                              ),
                            ],
                          ),
                        ),
                        Icon(
                          garageId == garage.id
                              ? Icons.radio_button_checked
                              : Icons.radio_button_off,
                          color: garageId == garage.id ? p.brand : p.secondary,
                        ),
                      ],
                    ),
                  ),
                ),
          ],
        ),
      ),
      footer: SaveButton(
        label: step == steps ? context.l10n.createAccount : context.l10n.continueLabel,
        icon: step == steps ? Icons.check : Icons.arrow_forward,
        busy: busy,
        onPressed: next,
      ),
    );
  }
}
