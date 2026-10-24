import 'package:flutter/material.dart';

import '../../app_state.dart';
import '../../design/widgets.dart';
import '../../l10n/l10n.dart';
import '../settings.dart';
import 'jobs.dart';

/// Mechanic panel: My jobs and Settings, with 64px workshop targets.
class MechanicShell extends StatefulWidget {
  const MechanicShell({super.key, required this.state, required this.onLogout});
  final AppState state;
  final VoidCallback onLogout;
  @override
  State<MechanicShell> createState() => _MechanicShellState();
}

class _MechanicShellState extends State<MechanicShell> {
  int tab = 0;
  int refresh = 0;
  @override
  Widget build(BuildContext context) {
    final repo = widget.state.repository!;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            if (repo.isDemo) const DemoNotice(),
            Expanded(
              child: IndexedStack(
                index: tab,
                children: [
                  MechanicJobsTab(
                    repository: repo,
                    name: widget.state.name,
                    refreshKey: refresh,
                  ),
                  SettingsScreen(state: widget.state, onLogout: widget.onLogout),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: FloatingDock(
        large: true,
        index: tab,
        onSelect: (index) => setState(() {
          if (index == 0 && tab != 0) refresh++;
          tab = index;
        }),
        items: [
          DockItem(Icons.build_circle_outlined, context.l10n.myWork),
          DockItem(Icons.settings_outlined, context.l10n.settings),
        ],
      ),
    );
  }
}
