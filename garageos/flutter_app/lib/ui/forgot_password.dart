import 'dart:async';

import 'package:flutter/material.dart';

import '../data/accounts.dart';
import '../data/api_client.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../l10n/l10n.dart';

/// Shared step header: "1 / 2" pill and title.
class StepHeader extends StatelessWidget {
  const StepHeader({
    super.key,
    required this.step,
    required this.of,
    required this.title,
    this.detail,
  });
  final int step, of;
  final String title;
  final String? detail;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        children: [
          for (var i = 1; i <= of; i++) ...[
            if (i > 1) const SizedBox(width: 6),
            Expanded(
              child: Container(
                height: 6,
                decoration: BoxDecoration(
                  color: i <= step ? context.colors.brand : context.colors.border,
                  borderRadius: BorderRadius.circular(Radii.control),
                ),
              ),
            ),
          ],
        ],
      ),
      const SizedBox(height: Space.md),
      Text(
        context.l10n.stepOf(step, of),
        style: context.mono(size: 12, color: context.colors.secondary),
      ),
      const SizedBox(height: Space.xs),
      Semantics(
        header: true,
        child: Text(title, style: Theme.of(context).textTheme.headlineSmall),
      ),
      if (detail != null) ...[
        const SizedBox(height: Space.xs),
        Text(
          detail!,
          style: Theme.of(
            context,
          ).textTheme.bodyLarge?.copyWith(color: context.colors.secondary),
        ),
      ],
      const SizedBox(height: Space.group),
    ],
  );
}

/// 60-second resend countdown shared by sign-up and password reset.
class ResendTimer extends StatefulWidget {
  const ResendTimer({super.key, required this.onResend});
  final Future<void> Function() onResend;
  @override
  State<ResendTimer> createState() => _ResendTimerState();
}

class _ResendTimerState extends State<ResendTimer> {
  Timer? timer;
  int left = 60;
  bool sending = false;
  @override
  void initState() {
    super.initState();
    start();
  }

  void start() {
    timer?.cancel();
    left = 60;
    timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => left--);
      if (left <= 0) t.cancel();
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => left > 0
      ? Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Text(
            context.l10n.resendIn('0:${left.toString().padLeft(2, '0')}'),
            style: context.mono(size: 13, color: context.colors.secondary),
          ),
        )
      : TextButton.icon(
          onPressed: sending
              ? null
              : () async {
                  setState(() => sending = true);
                  try {
                    await widget.onResend();
                    if (mounted) setState(start);
                  } finally {
                    if (mounted) setState(() => sending = false);
                  }
                },
          icon: const Icon(Icons.refresh),
          label: Text(context.l10n.resendCode),
        );
}

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, required this.source, this.initial});
  final AccountSource source;
  final String? initial;
  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final form = GlobalKey<FormState>();
  late final identifier = TextEditingController(text: widget.initial);
  final code = TextEditingController(), password = TextEditingController();
  int step = 1;
  bool busy = false, obscure = true;
  String? error;

  @override
  void dispose() {
    identifier.dispose();
    code.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> run(Future<void> Function() action) async {
    if (!validateForm(form)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.resetPassword,
    demo: widget.source.isDemo,
    body: Form(
      key: form,
      child: ListView(
        padding: const EdgeInsets.all(Space.page),
        children: [
          StepHeader(
            step: step,
            of: 2,
            title: step == 1
                ? context.l10n.resetPassword
                : context.l10n.enterCode,
            detail: step == 1
                ? context.l10n.resetHint
                : context.l10n.codeSentTo(identifier.text.trim()),
          ),
          if (error != null) ErrorNotice(error!),
          if (step == 1)
            TextFormField(
              controller: identifier,
              enabled: !busy,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              decoration: InputDecoration(
                labelText: context.l10n.emailOrPhone,
                prefixIcon: const Icon(Icons.alternate_email),
              ),
              validator: (s) => (s?.trim().length ?? 0) >= 5
                  ? null
                  : context.l10n.requiredField,
            )
          else ...[
            OtpField(
              controller: code,
              label: context.l10n.smsCode,
              enabled: !busy,
            ),
            ResendTimer(
              onResend: () => widget.source.requestReset(identifier.text),
            ),
            const SizedBox(height: Space.sm),
            TextFormField(
              controller: password,
              enabled: !busy,
              obscureText: obscure,
              autofillHints: const [AutofillHints.newPassword],
              decoration: InputDecoration(
                labelText: context.l10n.newPassword,
                helperText: context.l10n.passwordRule,
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
          ],
        ],
      ),
    ),
    footer: SaveButton(
      label: step == 1 ? context.l10n.sendCode : context.l10n.confirm,
      busy: busy,
      icon: step == 1 ? Icons.sms_outlined : Icons.check,
      onPressed: () => run(() async {
        if (step == 1) {
          await widget.source.requestReset(identifier.text.trim());
          if (mounted) setState(() => step = 2);
          return;
        }
        if (code.text.length != 6) throw const AppFailure(wrongCode);
        await widget.source.confirmReset(
          identifier: identifier.text.trim(),
          code: code.text,
          password: password.text,
        );
        if (!context.mounted) return;
        toast(context, context.l10n.passwordUpdated);
        Navigator.pop(context);
      }),
    ),
  );
}
