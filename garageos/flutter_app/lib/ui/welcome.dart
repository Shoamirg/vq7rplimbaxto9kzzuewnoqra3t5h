import 'package:flutter/material.dart';

import '../app_state.dart';
import '../design/brand.dart';
import '../design/theme.dart';
import '../design/vehicle_stage.dart';
import '../design/widgets.dart';
import '../l10n/l10n.dart';
import 'settings.dart';
import 'sign_in.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key, required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Space.page),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const Wordmark(size: 20),
                      const Spacer(),
                      IconButton(
                        tooltip: context.l10n.toggleTheme,
                        onPressed: () =>
                            state.toggleTheme(Theme.of(context).brightness),
                        icon: const Icon(Icons.contrast),
                      ),
                    ],
                  ),
                  const SizedBox(height: Space.group),
                  if (state.sessionNotice != null)
                    ErrorNotice(state.sessionNotice!),
                  BentoCard(
                    padding: const EdgeInsets.fromLTRB(
                      Space.card,
                      Space.card,
                      Space.card,
                      Space.tile,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const LogoTile(size: 56),
                        const SizedBox(height: Space.group),
                        Semantics(
                          header: true,
                          child: Text(
                            context.l10n.welcomePromise,
                            style: Theme.of(context).textTheme.displaySmall,
                          ),
                        ),
                        const SizedBox(height: Space.md),
                        const VehicleStage(blueprint: true),
                      ],
                    ),
                  ),
                  const SizedBox(height: Space.grid),
                  LanguagePills(state: state),
                  const SizedBox(height: Space.group),
                  PillButton(
                    label: context.l10n.enterAsCustomer,
                    icon: Icons.directions_car_outlined,
                    expand: true,
                    onPressed: () => openPage(
                      context,
                      SignInScreen(state: state, role: Role.customer),
                    ),
                  ),
                  const SizedBox(height: Space.md),
                  PillButton(
                    label: context.l10n.enterAsStaff,
                    icon: Icons.badge_outlined,
                    kind: PillKind.secondary,
                    expand: true,
                    onPressed: () => openPage(
                      context,
                      SignInScreen(state: state, role: Role.staff),
                    ),
                  ),
                  const SizedBox(height: Space.group),
                  Material(
                    color: p.muted,
                    shape: StadiumBorder(side: BorderSide(color: p.border)),
                    clipBehavior: Clip.antiAlias,
                    child: SwitchListTile(
                      value: state.demoMode,
                      onChanged: state.setDemoMode,
                      secondary: Icon(
                        Icons.science_outlined,
                        color: p.secondary,
                      ),
                      title: Text(context.l10n.demoMode),
                      subtitle: Text(context.l10n.demoModeHint),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 20,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
