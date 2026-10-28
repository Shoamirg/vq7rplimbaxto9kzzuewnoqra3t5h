import 'package:flutter/widgets.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/l10n.dart';
import 'widgets.dart';

/// Opens the phone dialler; copies the number when no dialler is available.
Future<void> launchDialer(BuildContext context, String phone) async {
  final digits = phone.replaceAll(RegExp(r'[^\d+]'), '');
  try {
    if (await launchUrl(Uri(scheme: 'tel', path: digits))) return;
  } catch (_) {
    // Fall through to copying the number.
  }
  if (context.mounted) {
    await copyText(context, phone, context.l10n.phoneCopied);
  }
}
