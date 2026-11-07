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
                  const SizedBox(height: Space.section),
                  if (state.sessionNotice != null)
                    ErrorNotice(state.sessionNotice!),
                  // Website hero: status pill, heavy headline on the canvas,
                  // then the vehicle stage on its own floating card.
                  Align(
                    alignment: Alignment.centerLeft,
                    child: StatusPill(context.l10n.welcomeBadge),
                  ),
                  const SizedBox(height: Space.md),
                  Semantics(
                    header: true,
                    child: Text(
                      context.l10n.welcomePromise,
                      style: Theme.of(context).textTheme.displaySmall,
                    ),
                  ),
                  const SizedBox(height: Space.group),
                  const BentoCard(
                    padding: EdgeInsets.all(Space.tile),
                    child: VehicleStage(blueprint: true),
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
                  DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(Radii.card),
                      boxShadow: context.isDark ? Shadows.none : Shadows.card,
                    ),
                    child: Material(
                    color: p.elevated,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(Radii.card),
                      side: BorderSide(color: p.hairline),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: SwitchListTile(
                      value: state.demoMode,
                      onChanged: state.setDemoMode,
                      secondary: const IconSquare(
                        Icons.science_outlined,
                        size: 40,
                      ),
                      title: Text(context.l10n.demoMode),
                      subtitle: Text(context.l10n.demoModeHint),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 4,
                      ),
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
