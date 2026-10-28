import 'package:flutter/material.dart';

import '../../app_state.dart';
import '../../design/widgets.dart';
import '../../l10n/l10n.dart';
import '../billing.dart';
import '../customers.dart';
import '../inbox.dart';
import '../settings.dart';
import '../staff_home.dart';

/// Reception, owner and manager panel: Jobs, Customers, Invoices, Inbox,
/// Settings.
class ReceptionShell extends StatefulWidget {
  const ReceptionShell({
    super.key,
    required this.state,
    required this.onLogout,
  });
  final AppState state;
  final VoidCallback onLogout;
  @override
  State<ReceptionShell> createState() => _ReceptionShellState();
}

class _ReceptionShellState extends State<ReceptionShell> {
  int tab = 0;
  int unread = 0;
  final visited = <int>{0};
  final refreshKeys = [0, 0, 0, 0, 0];

  @override
  void initState() {
    super.initState();
    // The dock badge is best effort; sources without an inbox show none.
    widget.state.repository!.threads().then((threads) {
      if (mounted) {
        setState(
          () => unread = threads.fold<int>(0, (sum, t) => sum + t.unread),
        );
      }
    }, onError: (_) {});
  }

  void selectTab(int index) {
    if (index == tab) return;
    setState(() {
      visited.add(index);
      tab = index;
      refreshKeys[index]++;
    });
  }

  @override
  Widget build(BuildContext context) {
    final repo = widget.state.repository!;
    final pages = [
      WorkList(repository: repo, refreshKey: refreshKeys[0]),
      CustomerList(repository: repo, refreshKey: refreshKeys[1]),
      BillList(repository: repo, refreshKey: refreshKeys[2]),
      InboxTab(
        repository: repo,
        refreshKey: refreshKeys[3],
        onUnread: (count) {
          if (count != unread && mounted) setState(() => unread = count);
        },
      ),
      SettingsScreen(state: widget.state, onLogout: widget.onLogout),
    ];
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            if (repo.isDemo) const DemoNotice(),
            if (!repo.canWrite) const ReadOnlyNotice(),
            Expanded(
              child: IndexedStack(
                index: tab,
                children: [
                  for (var i = 0; i < pages.length; i++)
                    visited.contains(i) ? pages[i] : const SizedBox.shrink(),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: FloatingDock(
        index: tab,
        onSelect: selectTab,
        items: [
          DockItem(Icons.build_circle_outlined, context.l10n.jobs),
          DockItem(Icons.people_outline, context.l10n.customers),
          DockItem(Icons.receipt_long_outlined, context.l10n.invoices),
          DockItem(Icons.inbox_outlined, context.l10n.inbox, badge: unread),
          DockItem(Icons.settings_outlined, context.l10n.settings),
        ],
      ),
    );
  }
}
