import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../app_state.dart';
import '../data/api_client.dart';
import '../design/theme.dart';
import '../l10n/l10n.dart';
import 'settings.dart';
import '../design/widgets.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.state});
  final AppState state;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final form = GlobalKey<FormState>();
  final email = TextEditingController(), password = TextEditingController();
  late final address = TextEditingController(
    text: const String.fromEnvironment('API_URL') != ''
        ? const String.fromEnvironment('API_URL')
        : !kIsWeb && defaultTargetPlatform == TargetPlatform.android
        ? 'http://10.0.2.2:8000/api/v1'
        : 'http://127.0.0.1:8000/api/v1',
  );
  bool busy = false, obscure = true;
  bool customer = false;
  String? error;
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
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      actions: [
        const LanguageMenu(),
        IconButton(
          tooltip: context.l10n.toggleTheme,
          onPressed: () =>
              widget.state.toggleTheme(Theme.of(context).brightness),
          icon: Icon(Icons.brightness_6_outlined),
        ),
      ],
    ),
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: EdgeInsets.all(Space.page),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: 440),
            child: Form(
              key: form,
              autovalidateMode: AutovalidateMode.onUserInteraction,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: context.colors.brandSoft,
                          borderRadius: BorderRadius.circular(Radii.card),
                        ),
                        child: Icon(
                          Icons.home_repair_service_outlined,
                          color: context.colors.brand,
                          size: 28,
                        ),
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'GarageOS',
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            Text(
                              customer
                                  ? context.l10n.customerPortal
                                  : context.l10n.staffApp,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 40),
                  Text(
                    context.l10n.welcome,
                    style: Theme.of(context).textTheme.displaySmall,
                  ),
                  SizedBox(height: 8),
                  Text(context.l10n.loginSubtitle),
                  SizedBox(height: 32),
                  SegmentedButton<bool>(
                    segments: [
                      ButtonSegment(
                        value: false,
                        label: Text(context.l10n.staffSignIn),
                      ),
                      ButtonSegment(
                        value: true,
                        label: Text(context.l10n.customerSignIn),
                      ),
                    ],
                    selected: {customer},
                    onSelectionChanged: busy
                        ? null
                        : (value) => setState(() => customer = value.first),
                  ),
                  SizedBox(height: 16),
                  if (error != null) ErrorNotice(error!),
                  TextFormField(
                    controller: email,
                    enabled: !busy,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    enableSuggestions: false,
                    autofillHints: [AutofillHints.username],
                    textInputAction: TextInputAction.next,
                    decoration: InputDecoration(
                      labelText: context.l10n.email,
                      prefixIcon: Icon(Icons.alternate_email),
                    ),
                    validator: (s) =>
                        RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                            .hasMatch(s?.trim() ?? '')
                        ? null
                        : context.l10n.emailError,
                  ),
                  SizedBox(height: 16),
                  TextFormField(
                    controller: password,
                    enabled: !busy,
                    obscureText: obscure,
                    autofillHints: [AutofillHints.password],
                    onFieldSubmitted: (_) => busy ? null : login(),
                    decoration: InputDecoration(
                      labelText: context.l10n.password,
                      prefixIcon: Icon(Icons.lock_outline),
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
                  SizedBox(height: 16),
                  SaveButton(
                    label: context.l10n.signIn,
                    onPressed: login,
                    busy: busy,
                  ),
                  SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: busy ? null : widget.state.demo,
                    child: Text(context.l10n.openDemo),
                  ),
                  SizedBox(height: 12),
                  Text(
                    context.l10n.demoExplanation,
                    style: Theme.of(context).textTheme.bodyMedium
                        ?.copyWith(color: context.colors.secondary),
                  ),
                  SizedBox(height: 16),
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
                      SizedBox(height: 12),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
