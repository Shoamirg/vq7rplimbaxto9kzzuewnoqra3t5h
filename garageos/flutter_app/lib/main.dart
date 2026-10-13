import 'dart:async';

import 'package:flutter/material.dart';

import 'app_state.dart';
import 'design/theme.dart';
import 'l10n/generated/app_localizations.dart';
import 'ui/login.dart';
import 'ui/settings.dart';
import 'ui/staff_home.dart';
import 'ui/customer_home.dart';

void main() => runApp(const GarageApp());

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
    builder: (context, _) => MaterialApp(
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
          ? CustomerHome(state: state, onLogout: logout)
          : state.repository == null
          ? LoginScreen(state: state)
          : StaffHome(state: state, onLogout: logout),
    ),
  );
}
