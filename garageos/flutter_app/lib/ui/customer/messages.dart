import 'package:flutter/material.dart';

import '../../data/customer_portal.dart';
import '../../domain/portal.dart';
import '../../design/theme.dart';
import '../../design/widgets.dart';
import '../../l10n/l10n.dart';
import '../chat.dart';

class MessagesTab extends StatelessWidget {
  const MessagesTab({
    super.key,
    required this.portal,
    this.refreshKey = 0,
    this.onUnread,
    this.showTitle = true,
  });
  final CustomerPortal portal;
  final int refreshKey;
  final ValueChanged<int>? onUnread;
  final bool showTitle;

  @override
  Widget build(BuildContext context) => ListLoadView<List<Thread>>(
    storageKey: 'customer-threads',
    loadKey: (portal, refreshKey),
    filterKey: portal,
    load: () async {
      final threads = await portal.threads();
      onUnread?.call(threads.fold<int>(0, (sum, t) => sum + t.unread));
      return threads;
    },
    header: (threads, reload, loading) => [
      if (showTitle) ...[
        Semantics(
          header: true,
          child: Text(
            context.l10n.messages,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
        ),
        const SizedBox(height: Space.grid),
      ],
    ],
    items: (threads, reload) => [
      if (threads.isEmpty)
        EmptyState(
          icon: Icons.chat_bubble_outline,
          title: context.l10n.noMessagesYet,
        ),
      for (final thread in threads)
        Padding(
          padding: const EdgeInsets.only(bottom: Space.md),
          child: ThreadTile(
            thread: thread,
            onTap: () async {
              await openPage(
                context,
                CustomerChatScreen(
                  portal: portal,
                  thread: thread.id,
                  title: thread.title,
                  contextLabel: thread.context,
                  phone: thread.phone,
                ),
              );
              await reload();
            },
          ),
        ),
    ],
  );
}

/// Messages opened from another screen rather than the dock.
class MessagesScreen extends StatelessWidget {
  const MessagesScreen({super.key, required this.portal});
  final CustomerPortal portal;
  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.messages,
    demo: portal.isDemo,
    body: MessagesTab(portal: portal, showTitle: false),
  );
}

class CustomerChatScreen extends StatelessWidget {
  const CustomerChatScreen({
    super.key,
    required this.portal,
    required this.thread,
    required this.title,
    this.contextLabel,
    this.phone,
  });
  final CustomerPortal portal;
  final String thread, title;
  final String? contextLabel, phone;
  @override
  Widget build(BuildContext context) => ChatScreen(
    title: title,
    contextLabel: contextLabel,
    phone: phone,
    demo: portal.isDemo,
    load: () => portal.messages(thread),
    send: (text, photos) => portal.send(thread, text, photos: photos),
  );
}
