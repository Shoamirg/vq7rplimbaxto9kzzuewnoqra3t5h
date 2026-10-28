import 'package:flutter/material.dart';

import '../data/notification_feed.dart';
import '../design/foreground_polling.dart';

/// Local delivery channel. The server owns the persisted feed; this view only
/// presents new foreground items after the user opted in. No Expo token or
/// platform push permission is requested by this adapter.
class NotificationBanner extends StatefulWidget {
  const NotificationBanner({super.key, required this.child, this.feed});
  final Widget child;
  final NotificationFeed? feed;
  @override
  State<NotificationBanner> createState() => _NotificationBannerState();
}

class _NotificationBannerState extends State<NotificationBanner>
    with ForegroundPolling {
  final seen = <String>{};
  bool initialized = false;
  AppNotification? latest;
  @override
  bool get pollingEnabled => widget.feed != null;
  @override
  void didUpdateWidget(NotificationBanner oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.feed, widget.feed)) {
      seen.clear();
      initialized = false;
      latest = null;
      // Resubscribe the periodic foreground timer for the new identity.
      restartPolling();
    }
  }

  @override
  Future<void> poll() async {
    final source = widget.feed;
    if (source == null) return;
    try {
      final items = await source.notifications();
      if (!mounted || !identical(source, widget.feed)) return;
      final unseen = items.where((item) => !seen.contains(item.id)).toList();
      if (initialized && unseen.isNotEmpty) {
        setState(() => latest = unseen.first);
      }
      seen.addAll(items.map((item) => item.id));
      initialized = true;
    } catch (_) {
      // Feed delivery is best effort; business commands have their own errors.
    }
  }

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      widget.child,
      if (latest != null)
        Positioned(
          top: MediaQuery.paddingOf(context).top + 8,
          left: 12,
          right: 12,
          child: Material(
            elevation: 8,
            borderRadius: BorderRadius.circular(16),
            color: Theme.of(context).colorScheme.surfaceContainerHigh,
            child: ListTile(
              leading: const Icon(Icons.notifications_active_outlined),
              title: Text(
                latest!.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: latest!.body.isEmpty
                  ? null
                  : Text(
                      latest!.body,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
              trailing: IconButton(
                onPressed: () => setState(() => latest = null),
                icon: const Icon(Icons.close),
              ),
            ),
          ),
        ),
    ],
  );
}
