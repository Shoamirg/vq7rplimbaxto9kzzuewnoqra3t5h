import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../domain/portal.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../l10n/l10n.dart';

const maxPhotos = 5;

String initials(String name) {
  final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
  return words.isEmpty
      ? '—'
      : words.take(2).map((w) => w.characters.first).join().toUpperCase();
}

class Initials extends StatelessWidget {
  const Initials(this.name, {super.key, this.size = 48});
  final String name;
  final double size;
  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: context.colors.muted,
        borderRadius: BorderRadius.circular(Radii.icon),
        border: Border.all(color: context.colors.border),
      ),
      child: Text(initials(name), style: context.numeral(size * .34)),
    ),
  );
}

/// Conversation row: last message preview and an unread dot.
class ThreadTile extends StatelessWidget {
  const ThreadTile({super.key, required this.thread, required this.onTap});
  final Thread thread;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final unread = thread.unread > 0;
    return BentoCard(
      padding: const EdgeInsets.all(Space.tile),
      onTap: onTap,
      semanticLabel: [
        thread.title,
        if (unread) context.l10n.unreadCount(thread.unread),
        thread.preview,
      ].join(', '),
      child: ExcludeSemantics(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Initials(thread.title),
            const SizedBox(width: Space.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          thread.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                      const SizedBox(width: Space.sm),
                      Text(
                        context.stamp(thread.time),
                        style: Theme.of(
                          context,
                        ).textTheme.bodySmall?.copyWith(color: p.secondary),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          thread.preview,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: unread ? p.text : p.secondary,
                                fontWeight: unread
                                    ? FontWeight.w600
                                    : FontWeight.w400,
                              ),
                        ),
                      ),
                      if (unread) ...[
                        const SizedBox(width: Space.sm),
                        Container(
                          constraints: const BoxConstraints(minWidth: 22),
                          height: 22,
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: context.isDark ? p.success : Palette.emerald,
                            borderRadius: BorderRadius.circular(Radii.control),
                          ),
                          child: Text(
                            '${thread.unread}',
                            style: Theme.of(context).textTheme.labelSmall
                                ?.copyWith(
                                  color: p.onBrand,
                                  fontWeight: FontWeight.w700,
                                ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (thread.context != null) ...[
                    const SizedBox(height: Space.sm),
                    MonoBadge(
                      thread.context!,
                      icon: Icons.directions_car_outlined,
                      size: 12,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Bubbles: mine on the right, the other side on the left, inline photos,
/// timestamps and a bottom composer.
class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    required this.title,
    required this.load,
    required this.send,
    this.contextLabel,
    this.phone,
    this.demo = false,
  });
  final String title;
  final String? contextLabel, phone;
  final bool demo;
  final Future<List<ChatMessage>> Function() load;
  final Future<ChatMessage> Function(String text, List<String> photos) send;
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final text = TextEditingController();
  List<ChatMessage>? messages;
  final photos = <String>[];
  Object? error;
  String? sendError;
  bool sending = false;

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() => error = null);
    try {
      final data = await widget.load();
      if (mounted) setState(() => messages = data.toList());
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  Future<void> attach() async {
    if (photos.length >= maxPhotos) {
      toast(context, context.l10n.photoLimit);
      return;
    }
    final source = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.page, 0, Space.page, Space.page),
          child: Row(
            children: [
              for (final (icon, label) in [
                (Icons.photo_camera_outlined, context.l10n.camera),
                (Icons.photo_library_outlined, context.l10n.gallery),
              ]) ...[
                if (label == context.l10n.gallery) const SizedBox(width: Space.grid),
                Expanded(
                  child: BentoTile(
                    icon: icon,
                    label: context.l10n.attachPhoto,
                    valueWidget: Text(
                      label,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    onTap: () => Navigator.pop(context, label),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
    if (source != null && mounted) {
      setState(
        () => photos.add('$source · ${context.l10n.photoNumber(photos.length + 1)}'),
      );
    }
  }

  Future<void> submit() async {
    final body = text.text.trim();
    if (body.isEmpty && photos.isEmpty) return;
    setState(() {
      sending = true;
      sendError = null;
    });
    try {
      final message = await widget.send(body, List.of(photos));
      if (!mounted) return;
      setState(() {
        messages = [...?messages, message];
        photos.clear();
        text.clear();
      });
    } catch (e) {
      if (mounted) setState(() => sendError = failureText(e));
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final loaded = messages;
    return PageFrame(
      title: widget.title,
      demo: widget.demo,
      language: false,
      footerPadding: false,
      actions: [
        if (widget.phone != null)
          IconButton(
            tooltip: context.l10n.call,
            onPressed: () => callNumber(context, widget.phone!),
            icon: const Icon(Icons.call_outlined),
          ),
      ],
      body: Column(
        children: [
          if (widget.contextLabel != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.page, Space.sm, Space.page, 0),
              child: Align(
                alignment: Alignment.centerLeft,
                child: MonoBadge(
                  widget.contextLabel!,
                  icon: Icons.directions_car_outlined,
                ),
              ),
            ),
          Expanded(
            child: error != null
                ? ListView(
                    padding: const EdgeInsets.all(Space.page),
                    children: [failureView(context, error!, retry: load)],
                  )
                : loaded == null
                ? const SkeletonPage(layout: SkeletonLayout.chat)
                : loaded.isEmpty
                ? EmptyState(
                    icon: Icons.chat_bubble_outline,
                    title: context.l10n.noMessagesYet,
                  )
                : RefreshIndicator(
                    onRefresh: load,
                    child: ListView.builder(
                      reverse: true,
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(Space.page),
                      itemCount: loaded.length,
                      itemBuilder: (context, index) =>
                          _Bubble(loaded[loaded.length - 1 - index]),
                    ),
                  ),
          ),
        ],
      ),
      footer: error != null && isUnavailable(error!)
          ? null
          : SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                decoration: BoxDecoration(
                  color: p.surface,
                  border: Border(top: BorderSide(color: p.border)),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (sendError != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Space.sm),
                        child: Text(
                          context.message(sendError!),
                          style: TextStyle(color: p.danger),
                        ),
                      ),
                    if (photos.isNotEmpty)
                      SizedBox(
                        height: 40,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          children: [
                            for (final photo in photos)
                              Padding(
                                padding: const EdgeInsets.only(right: Space.sm),
                                child: InputChip(
                                  avatar: const Icon(Icons.image_outlined, size: 18),
                                  label: Text(photo),
                                  onDeleted: sending
                                      ? null
                                      : () => setState(() => photos.remove(photo)),
                                  deleteButtonTooltipMessage:
                                      context.l10n.removePhoto,
                                ),
                              ),
                          ],
                        ),
                      ),
                    if (photos.isNotEmpty) const SizedBox(height: Space.sm),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        IconButton(
                          tooltip: context.l10n.attachPhoto,
                          onPressed: sending ? null : attach,
                          icon: Badge(
                            isLabelVisible: photos.isNotEmpty,
                            label: Text('${photos.length}/$maxPhotos'),
                            child: const Icon(Icons.add_a_photo_outlined),
                          ),
                        ),
                        Expanded(
                          child: TextField(
                            controller: text,
                            enabled: !sending,
                            minLines: 1,
                            maxLines: 4,
                            maxLength: 2000,
                            textCapitalization: TextCapitalization.sentences,
                            decoration: InputDecoration(
                              hintText: context.l10n.typeMessage,
                              labelText: context.l10n.typeMessage,
                              floatingLabelBehavior: FloatingLabelBehavior.never,
                              counterText: '',
                              fillColor: p.elevated,
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 18,
                                vertical: 14,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: Space.sm),
                        IconButton.filled(
                          tooltip: context.l10n.send,
                          style: IconButton.styleFrom(
                            backgroundColor: context.isDark
                                ? p.success
                                : Palette.emerald,
                            foregroundColor: p.onBrand,
                            minimumSize: const Size(52, 52),
                          ),
                          onPressed: sending ? null : submit,
                          icon: sending
                              ? const SizedBox.square(
                                  dimension: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.send_rounded),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble(this.message);
  final ChatMessage message;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final mine = message.mine;
    final fg = mine ? p.onBrand : p.text;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * .78,
        ),
        child: Padding(
          padding: const EdgeInsets.only(bottom: Space.md),
          child: Column(
            crossAxisAlignment: mine
                ? CrossAxisAlignment.end
                : CrossAxisAlignment.start,
            children: [
              if (!mine && message.author != null)
                Padding(
                  padding: const EdgeInsets.only(left: 6, bottom: 4),
                  child: Text(
                    message.author!,
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: p.secondary),
                  ),
                ),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: mine ? p.brand : p.surface,
                  border: mine ? null : Border.all(color: p.border),
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(Radii.tile),
                    topRight: const Radius.circular(Radii.tile),
                    bottomLeft: Radius.circular(mine ? Radii.tile : 6),
                    bottomRight: Radius.circular(mine ? 6 : Radii.tile),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final photo in message.photos)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Space.sm),
                        child: _PhotoTile(photo, inverse: mine),
                      ),
                    if (message.text.isNotEmpty)
                      Text(
                        message.text,
                        style: Theme.of(
                          context,
                        ).textTheme.bodyLarge?.copyWith(color: fg),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(6, 4, 6, 0),
                child: Text(
                  context.clock(message.time),
                  style: context.mono(size: 11, color: p.secondary),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Inspection photo placeholder with its caption.
class _PhotoTile extends StatelessWidget {
  const _PhotoTile(this.caption, {required this.inverse});
  final String caption;
  final bool inverse;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return Semantics(
      label: '${context.l10n.photo}: $caption',
      image: true,
      excludeSemantics: true,
      child: Container(
        width: 220,
        height: 140,
        decoration: BoxDecoration(
          color: inverse ? const Color(0x26FFFFFF) : p.muted,
          borderRadius: BorderRadius.circular(Radii.icon),
        ),
        child: Stack(
          children: [
            Center(
              child: Icon(
                Icons.image_outlined,
                size: 40,
                color: inverse ? const Color(0xB3FFFFFF) : p.secondary,
              ),
            ),
            Positioned(
              left: 8,
              bottom: 8,
              right: 8,
              child: Text(
                caption,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.mono(
                  size: 11,
                  color: inverse ? const Color(0xFFECEEF1) : p.text,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
