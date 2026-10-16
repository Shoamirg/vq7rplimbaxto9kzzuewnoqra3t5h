import 'package:flutter/material.dart';

import '../app_state.dart';
import '../l10n/l10n.dart';

class SettingsScope extends InheritedNotifier<AppState> {
  const SettingsScope({
    super.key,
    required AppState state,
    required super.child,
  }) : super(notifier: state);

  static AppState? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SettingsScope>()?.notifier;
}

class LanguageMenu extends StatelessWidget {
  const LanguageMenu({super.key});

  @override
  Widget build(BuildContext context) {
    final state = SettingsScope.maybeOf(context);
    if (state == null) return const SizedBox.shrink();
    return PopupMenuButton<String>(
      key: const ValueKey('language-menu'),
      tooltip: context.l10n.language,
      initialValue: state.locale.languageCode,
      onSelected: (code) async {
        final saved = await state.setLocale(Locale(code));
        if (!saved && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(context.l10n.preferenceSaveError)),
          );
        }
      },
      itemBuilder: (context) => const [
        PopupMenuItem(value: 'uz', child: Text('O‘zbekcha')),
        PopupMenuItem(value: 'en', child: Text('English')),
        PopupMenuItem(value: 'ru', child: Text('Русский')),
      ],
      icon: const Icon(Icons.language_outlined),
    );
  }
}
