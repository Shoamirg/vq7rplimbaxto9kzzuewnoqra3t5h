import 'package:flutter/material.dart';

import '../data/repository.dart';
import '../domain/portal.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../l10n/l10n.dart';
import 'chat.dart';

/// Reception inbox: customer threads with unread badge and linked car pill.
class InboxTab extends StatelessWidget {
  const InboxTab({
    super.key,
    required this.repository,
    this.refreshKey = 0,
    this.onUnread,
  });
  final GarageRepository repository;
  final int refreshKey;
  final ValueChanged<int>? onUnread;

  @override
  Widget build(BuildContext context) => ListLoadView<List<Thread>>(
    storageKey: 'staff-inbox',
    loadKey: (repository, refreshKey),
    filterKey: repository,
    load: () async {
      final threads = await repository.threads();
      onUnread?.call(threads.fold<int>(0, (sum, t) => sum + t.unread));
      return threads;
    },
    header: (threads, reload, loading) => [
      Row(
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Text(
                context.l10n.inbox,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
          ),
          if (threads != null)
            StatusBadge(
              context.l10n.unreadCount(
                threads.fold<int>(0, (sum, t) => sum + t.unread),
              ),
              tone: threads.any((t) => t.unread > 0) ? 'success' : 'neutral',
              icon: Icons.mark_chat_unread_outlined,
            ),
        ],
      ),
      const SizedBox(height: Space.grid),
    ],
    items: (threads, reload) => [
      if (threads.isEmpty)
        EmptyState(
          icon: Icons.inbox_outlined,
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
                ChatScreen(
                  title: thread.title,
                  contextLabel: thread.context,
                  phone: thread.phone,
                  demo: repository.isDemo,
                  load: () => repository.messages(thread.id),
                  send: (text, photos) =>
                      repository.sendMessage(thread.id, text, photos: photos),
                ),
              );
              await reload();
            },
          ),
        ),
    ],
  );
}
