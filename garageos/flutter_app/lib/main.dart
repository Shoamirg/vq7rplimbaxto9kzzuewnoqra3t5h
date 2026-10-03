import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'app_state.dart';
import 'design/theme.dart';
import 'ui/login.dart';
import 'ui/staff_home.dart';

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
    state.onExpired = logout;
  }

  void logout() {
    navigator.currentState?.popUntil((route) => route.isFirst);
    state.logout();
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
      locale: const Locale('uz'),
      supportedLocales: const [Locale('uz')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
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
      home: state.repository == null
          ? LoginScreen(state: state)
          : StaffHome(state: state, onLogout: logout),
    ),
  );
}
