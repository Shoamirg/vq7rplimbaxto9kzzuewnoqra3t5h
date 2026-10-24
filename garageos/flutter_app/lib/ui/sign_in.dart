import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../app_state.dart';
import '../data/api_client.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../l10n/l10n.dart';
import 'forgot_password.dart';
import 'settings.dart';
import 'sign_up.dart';

String defaultApiAddress() => const String.fromEnvironment('API_URL') != ''
    ? const String.fromEnvironment('API_URL')
    : !kIsWeb && defaultTargetPlatform == TargetPlatform.android
    ? 'http://10.0.2.2:8000/api/v1'
    : 'http://127.0.0.1:8000/api/v1';

/// Leaves the pre-sign-in stack once a session exists; the app root shows
/// the role's shell.
void enterApp(BuildContext context) =>
    Navigator.of(context).popUntil((route) => route.isFirst);

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.state, required this.role});
  final AppState state;
  final Role role;
  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final form = GlobalKey<FormState>();
  late final email = TextEditingController(
    text: widget.state.demoMode
        ? customer
              ? 'aziz.karimov@example.com'
              : 'qabul@turon.uz'
        : '',
  );
  late final password = TextEditingController(
    text: widget.state.demoMode ? 'demo-parol-2026' : '',
  );
  late final address = TextEditingController(text: defaultApiAddress());
  bool busy = false, obscure = true;
  String? error;
  bool get customer => widget.role == Role.customer;

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    address.dispose();
    super.dispose();
  }

  Future<void> login() async {
    if (!validateForm(form)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.state.login(
        address.text,
        email.text,
        password.text,
        customer: customer,
      );
      if (mounted) enterApp(context);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void openDemo(DemoRole role) {
    widget.state.demo(role);
    enterApp(context);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: p.background,
        shape: const RoundedRectangleBorder(),
        actions: const [LanguageMenu()],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Space.page),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Form(
                key: form,
                autovalidateMode: AutovalidateMode.onUserInteraction,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: IconSquare(
                        customer
                            ? Icons.directions_car_outlined
                            : Icons.badge_outlined,
                        size: 56,
                      ),
                    ),
                    const SizedBox(height: Space.group),
                    Semantics(
                      header: true,
                      child: Text(
                        customer
                            ? context.l10n.enterAsCustomer
                            : context.l10n.enterAsStaff,
                        style: Theme.of(context).textTheme.displaySmall,
                      ),
                    ),
                    const SizedBox(height: Space.sm),
                    Text(
                      customer
                          ? context.l10n.customerSignInHint
                          : context.l10n.loginSubtitle,
                      style: Theme.of(
                        context,
                      ).textTheme.bodyLarge?.copyWith(color: p.secondary),
                    ),
                    const SizedBox(height: Space.group),
                    if (widget.state.demoMode) ...[
                      StatusBadge(
                        context.l10n.demoSignInHint,
                        icon: Icons.science_outlined,
                        tone: 'neutral',
                      ),
                      const SizedBox(height: Space.md),
                    ],
                    if (widget.state.sessionNotice != null)
                      ErrorNotice(widget.state.sessionNotice!),
                    if (error != null) ErrorNotice(error!),
                    TextFormField(
                      controller: email,
                      enabled: !busy,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      enableSuggestions: false,
                      autofillHints: const [AutofillHints.username],
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: context.l10n.email,
                        prefixIcon: const Icon(Icons.alternate_email),
                      ),
                      validator: (s) =>
                          RegExp(
                            r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                          ).hasMatch(s?.trim() ?? '')
                          ? null
                          : context.l10n.emailError,
                    ),
                    const SizedBox(height: Space.md),
                    TextFormField(
                      controller: password,
                      enabled: !busy,
                      obscureText: obscure,
                      autofillHints: const [AutofillHints.password],
                      onFieldSubmitted: (_) => busy ? null : login(),
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
                      validator: (s) => (s?.length ?? 0) >= 6
                          ? null
                          : context.l10n.passwordError,
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: busy
                            ? null
                            : () => openPage(
                                context,
                                ForgotPasswordScreen(
                                  source: widget.state.accounts,
                                  initial: email.text,
                                ),
                              ),
                        child: Text(context.l10n.forgotPassword),
                      ),
                    ),
                    const SizedBox(height: Space.sm),
                    SaveButton(
                      label: context.l10n.signIn,
                      onPressed: login,
                      busy: busy,
                      icon: Icons.login,
                    ),
                    if (customer) ...[
                      const SizedBox(height: Space.md),
                      Wrap(
                        alignment: WrapAlignment.center,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            context.l10n.noAccount,
                            style: TextStyle(color: p.secondary),
                          ),
                          TextButton(
                            onPressed: busy
                                ? null
                                : () => openPage(
                                    context,
                                    SignUpScreen(state: widget.state),
                                  ),
                            child: Text(context.l10n.createAccount),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: Space.group),
                    const Divider(height: 1),
                    const SizedBox(height: Space.group),
                    PillButton(
                      label: context.l10n.openDemo,
                      icon: Icons.science_outlined,
                      kind: PillKind.secondary,
                      expand: true,
                      onPressed: busy
                          ? null
                          : () => openDemo(
                              customer ? DemoRole.customer : DemoRole.reception,
                            ),
                    ),
                    if (!customer) ...[
                      const SizedBox(height: Space.sm),
                      PillButton(
                        label: context.l10n.openMechanicDemo,
                        icon: Icons.build_outlined,
                        kind: PillKind.quiet,
                        expand: true,
                        onPressed: busy
                            ? null
                            : () => openDemo(DemoRole.mechanic),
                      ),
                    ],
                    const SizedBox(height: Space.sm),
                    Text(
                      context.l10n.demoExplanation,
                      textAlign: TextAlign.center,
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(color: p.secondary),
                    ),
                    if (!widget.state.demoMode) ...[
                      const SizedBox(height: Space.md),
                      ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        childrenPadding: const EdgeInsets.only(top: 8),
                        title: Text(context.l10n.connectionSettings),
                        children: [
                          TextFormField(
                            controller: address,
                            enabled: !busy,
                            keyboardType: TextInputType.url,
                            autocorrect: false,
                            enableSuggestions: false,
                            style: context.mono(),
                            decoration: InputDecoration(
                              labelText: context.l10n.serverAddress,
                            ),
                            validator: (s) {
                              try {
                                ApiClient.validateAddress(s ?? '');
                                return null;
                              } catch (e) {
                                return context.message(failureText(e));
                              }
                            },
                          ),
                          const SizedBox(height: 12),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
