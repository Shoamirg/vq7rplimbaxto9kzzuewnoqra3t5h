import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../app_state.dart';
import '../data/api_client.dart';
import '../design/theme.dart';
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
      await widget.state.login(address.text, email.text, password.text);
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
        IconButton(
          tooltip: 'Koʻrinishni almashtirish',
          onPressed: () =>
              widget.state.toggleTheme(Theme.of(context).brightness),
          icon: const Icon(Icons.brightness_6_outlined),
        ),
      ],
    ),
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Space.page),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Form(
              key: form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: context.colors.brandSoft,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(
                          Icons.home_repair_service_outlined,
                          color: context.colors.brand,
                          size: 28,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'GarageOS',
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            const Text('Xodimlar uchun'),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 40),
                  Text(
                    'Xush kelibsiz',
                    style: Theme.of(context).textTheme.displaySmall,
                  ),
                  const SizedBox(height: 8),
                  const Text('Navbat, servis ishlari va hisoblar — bir joyda.'),
                  const SizedBox(height: 32),
                  if (error != null) ErrorNotice(error!),
                  TextFormField(
                    controller: email,
                    enabled: !busy,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    enableSuggestions: false,
                    autofillHints: const [AutofillHints.username],
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Email',
                      prefixIcon: Icon(Icons.alternate_email),
                    ),
                    validator: (s) =>
                        RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                            .hasMatch(s?.trim() ?? '')
                        ? null
                        : 'Email manzilini kiriting.',
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: password,
                    enabled: !busy,
                    obscureText: obscure,
                    autofillHints: const [AutofillHints.password],
                    onFieldSubmitted: (_) => busy ? null : login(),
                    decoration: InputDecoration(
                      labelText: 'Parol',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        tooltip: obscure
                            ? 'Parolni koʻrsatish'
                            : 'Parolni yashirish',
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
                        : 'Kamida 6 ta belgi kiriting.',
                  ),
                  const SizedBox(height: 16),
                  SaveButton(label: 'Kirish', onPressed: login, busy: busy),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: busy ? null : widget.state.demo,
                    child: const Text('Demo rejimni ochish'),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Demoda navbatdan hisobgacha sinab koʻring. Maʼlumotlar shu qurilmada vaqtincha saqlanadi.',
                    style: Theme.of(context).textTheme.bodyMedium
                        ?.copyWith(color: context.colors.secondary),
                  ),
                  const SizedBox(height: 16),
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: const Text('Ulanish sozlamalari'),
                    children: [
                      TextFormField(
                        controller: address,
                        enabled: !busy,
                        keyboardType: TextInputType.url,
                        autocorrect: false,
                        enableSuggestions: false,
                        decoration: const InputDecoration(
                          labelText: 'Server manzili',
                        ),
                        validator: (s) {
                          try {
                            ApiClient.validateAddress(s ?? '');
                            return null;
                          } catch (e) {
                            return failureText(e);
                          }
                        },
                      ),
                      const SizedBox(height: 12),
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
