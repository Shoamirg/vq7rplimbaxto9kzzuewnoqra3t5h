import 'package:flutter/material.dart';

import '../../app_state.dart';
import '../../design/widgets.dart';
import '../../l10n/l10n.dart';
import 'billing.dart';
import 'cars.dart';
import 'home.dart';
import 'messages.dart';
import 'profile.dart';

/// Customer panel: Home, Cars, Billing, Messages, Profile.
class CustomerShell extends StatefulWidget {
  const CustomerShell({super.key, required this.state, required this.onLogout});
  final AppState state;
  final VoidCallback onLogout;
  @override
  State<CustomerShell> createState() => _CustomerShellState();
}

class _CustomerShellState extends State<CustomerShell> {
  int tab = 0;
  int unread = 0;
  final visited = <int>{0};
  final refresh = [0, 0, 0, 0, 0];

  void select(int index) => setState(() {
    if (index == tab) return;
    visited.add(index);
    refresh[index]++;
    tab = index;
  });

  @override
  Widget build(BuildContext context) {
    final portal = widget.state.customerRepository!;
    final pages = [
      CustomerHomeTab(
        portal: portal,
        refreshKey: refresh[0],
        onTab: select,
        onUnread: (count) {
          if (count != unread && mounted) setState(() => unread = count);
        },
      ),
      CarsTab(portal: portal, refreshKey: refresh[1]),
      BillingTab(portal: portal, refreshKey: refresh[2]),
      MessagesTab(
        portal: portal,
        refreshKey: refresh[3],
        onUnread: (count) {
          if (count != unread && mounted) setState(() => unread = count);
        },
      ),
      ProfileTab(
        portal: portal,
        state: widget.state,
        onLogout: widget.onLogout,
      ),
    ];
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            if (portal.isDemo) const DemoNotice(),
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
        onSelect: select,
        items: [
          DockItem(Icons.home_outlined, context.l10n.home),
          DockItem(Icons.directions_car_outlined, context.l10n.cars),
          DockItem(Icons.account_balance_wallet_outlined, context.l10n.billing),
          DockItem(
            Icons.chat_bubble_outline,
            context.l10n.messages,
            badge: unread,
          ),
          DockItem(Icons.person_outline, context.l10n.profile),
        ],
      ),
    );
  }
}
