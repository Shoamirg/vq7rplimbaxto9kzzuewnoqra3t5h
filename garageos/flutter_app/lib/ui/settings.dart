import 'package:flutter/material.dart';

import '../app_state.dart';
import '../design/brand.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../l10n/l10n.dart';

const appVersion = '0.2.0';

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
      onSelected: (code) => selectLanguage(context, state, code),
      itemBuilder: (context) => const [
        PopupMenuItem(value: 'uz', child: Text('O‘zbekcha')),
        PopupMenuItem(value: 'en', child: Text('English')),
        PopupMenuItem(value: 'ru', child: Text('Русский')),
      ],
      icon: const Icon(Icons.language_outlined),
    );
  }
}

Future<void> selectLanguage(
  BuildContext context,
  AppState state,
  String code,
) async {
  final saved = await state.setLocale(Locale(code));
  if (!saved && context.mounted) {
    toast(context, context.l10n.preferenceSaveError);
  }
}

/// UZ | RU | EN pill picker.
class LanguagePills extends StatelessWidget {
  const LanguagePills({super.key, required this.state, this.long = false});
  final AppState state;
  final bool long;
  @override
  Widget build(BuildContext context) => PillSegments<String>(
    semanticLabel: context.l10n.language,
    values: const ['uz', 'ru', 'en'],
    selected: state.locale.languageCode,
    label: (code) => long
        ? const {'uz': 'O‘zbekcha', 'ru': 'Русский', 'en': 'English'}[code]!
        : code.toUpperCase(),
    onChanged: (code) => selectLanguage(context, state, code),
  );
}

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({
    super.key,
    required this.state,
    required this.onLogout,
    this.pushed = false,
  });
  final AppState state;
  final VoidCallback onLogout;

  /// Opened from the customer profile rather than a dock tab.
  final bool pushed;

  Future<void> signOut(BuildContext context) async {
    final demo =
        state.repository?.isDemo == true ||
        state.customerRepository?.isDemo == true;
    final yes = await confirmSheet(
      context,
      title: context.l10n.signOutTitle,
      message: demo ? context.l10n.demoSignOut : context.l10n.confirmSignOut,
      confirmLabel: context.l10n.signOut,
      icon: Icons.logout,
    );
    if (yes) onLogout();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final list = ListView(
      padding: const EdgeInsets.all(Space.page),
      children: [
        if (!pushed) ...[
          Text(
            context.l10n.settings,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: Space.grid),
        ],
        BentoCard(
          child: Row(
            children: [
              IconSquare(Icons.person_outline),
              const SizedBox(width: Space.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      state.name,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      state.garageName,
                      style: Theme.of(
                        context,
                      ).textTheme.bodyMedium?.copyWith(color: p.secondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        SectionTitle(context.l10n.language),
        LanguagePills(state: state, long: true),
        SectionTitle(context.l10n.theme),
        PillSegments<ThemeMode>(
          semanticLabel: context.l10n.theme,
          values: const [ThemeMode.system, ThemeMode.light, ThemeMode.dark],
          selected: state.themeMode,
          label: (mode) => switch (mode) {
            ThemeMode.system => context.l10n.themeSystem,
            ThemeMode.light => context.l10n.themeLight,
            ThemeMode.dark => context.l10n.themeDark,
          },
          onChanged: state.setThemeMode,
        ),
        const SizedBox(height: Space.grid),
        BentoCard(
          padding: EdgeInsets.zero,
          child: ListTile(
            minTileHeight: 64,
            contentPadding: const EdgeInsets.symmetric(horizontal: Space.card),
            leading: Icon(Icons.notifications_none, color: p.secondary),
            title: Text(context.l10n.notifications),
            subtitle: Text(
              switch (state.notificationsAllowed) {
                true => context.l10n.notificationsOn,
                false => context.l10n.notificationsOff,
                null => context.l10n.notificationsAsk,
              },
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () =>
                openPage(context, NotificationsScreen(state: state)),
          ),
        ),
        const SizedBox(height: Space.group),
        PillButton(
          label: context.l10n.signOut,
          icon: Icons.logout,
          kind: PillKind.secondary,
          expand: true,
          onPressed: () => signOut(context),
        ),
        const SizedBox(height: Space.group),
        Center(
          child: Column(
            children: [
              const LogoMark(size: 28),
              const SizedBox(height: Space.xs),
              Text(
                context.l10n.appVersion(appVersion),
                style: context.mono(size: 12, color: p.secondary),
              ),
            ],
          ),
        ),
      ],
    );
    return pushed
        ? PageFrame(title: context.l10n.settings, language: false, body: list)
        : list;
  }
}

/// Single value card asking to be told when the car is ready.
class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key, required this.state});
  final AppState state;

  Future<void> answer(BuildContext context, bool allowed) async {
    await state.setNotifications(allowed);
    if (!context.mounted) return;
    if (allowed) toast(context, context.l10n.notificationsOn);
    Navigator.pop(context, allowed);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(backgroundColor: context.colors.background),
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Space.page),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: BentoCard(
              elevated: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: IconSquare(
                      Icons.notifications_active_outlined,
                      tone: 'success',
                      size: 64,
                    ),
                  ),
                  const SizedBox(height: Space.group),
                  Text(
                    context.l10n.notificationsTitle,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: Space.sm),
                  Text(
                    context.l10n.notificationsDetail,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: context.colors.secondary,
                    ),
                  ),
                  const SizedBox(height: Space.group),
                  PillButton(
                    label: context.l10n.allow,
                    icon: Icons.check,
                    expand: true,
                    onPressed: () => answer(context, true),
                  ),
                  const SizedBox(height: Space.sm),
                  PillButton(
                    label: context.l10n.notNow,
                    kind: PillKind.quiet,
                    expand: true,
                    onPressed: () => answer(context, false),
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
