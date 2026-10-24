import 'dart:async';

import 'package:flutter/material.dart';

import 'app_state.dart';
import 'design/dialer.dart';
import 'design/theme.dart';
import 'design/widgets.dart';
import 'l10n/generated/app_localizations.dart';
import 'ui/customer/shell.dart';
import 'ui/mechanic/shell.dart';
import 'ui/reception/shell.dart';
import 'ui/settings.dart';
import 'ui/welcome.dart';

void main() {
  dial = launchDialer;
  runApp(const GarageApp());
}

class GarageApp extends StatefulWidget {
  const GarageApp({super.key, this.state});
  final AppState? state;
  @override
  State<GarageApp> createState() => _GarageAppState();
}

class _GarageAppState extends State<GarageApp> {
  late final AppState state = widget.state ?? AppState();
  final navigator = GlobalKey<NavigatorState>();
  @override
  void initState() {
    super.initState();
    state.onExpired = expire;
    unawaited(state.restoreLocale());
  }

  void logout() {
    navigator.currentState?.popUntil((route) => route.isFirst);
    unawaited(state.logout());
  }

  void expire() {
    navigator.currentState?.popUntil((route) => route.isFirst);
    state.expire();
  }

  @override
  void dispose() {
    state.onExpired = null;
    if (widget.state == null) state.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: state,
    builder: (context, _) {
      final staff = state.repository;
      return MaterialApp(
        navigatorKey: navigator,
        title: 'GarageOS',
        debugShowCheckedModeBanner: false,
        locale: state.locale,
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        builder: (context, child) => SettingsScope(state: state, child: child!),
        theme: garageTheme(Brightness.light),
        darkTheme: garageTheme(Brightness.dark),
        themeMode: state.themeMode,
        themeAnimationDuration:
            (MediaQuery.maybeDisableAnimationsOf(context) ??
                WidgetsBinding
                    .instance
                    .platformDispatcher
                    .accessibilityFeatures
                    .disableAnimations)
            ? Duration.zero
            : const Duration(milliseconds: 150),
        home: state.customerRepository != null
            ? CustomerShell(state: state, onLogout: logout)
            : staff == null
            ? WelcomeScreen(state: state)
            : staff.isMechanic
            ? MechanicShell(state: state, onLogout: logout)
            : ReceptionShell(state: state, onLogout: logout),
      );
    },
  );
}
