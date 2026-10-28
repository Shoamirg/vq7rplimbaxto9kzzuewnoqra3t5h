import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/api_client.dart';
import '../l10n/l10n.dart';
import 'bento.dart';
import 'theme.dart';

/// Static placeholder block. Skeletons match the layout they stand in for;
/// the app never shows a spinner for a whole screen.
class SkeletonBlock extends StatelessWidget {
  const SkeletonBlock({
    super.key,
    this.height = 16,
    this.width,
    this.radius = Radii.tile,
  });
  final double height;
  final double? width;
  final double radius;
  @override
  Widget build(BuildContext context) => Container(
    height: height,
    width: width,
    decoration: BoxDecoration(
      color: context.colors.muted,
      borderRadius: BorderRadius.circular(radius),
    ),
  );
}

enum SkeletonLayout { cards, grid, detail, chat }

class Skeleton extends StatelessWidget {
  const Skeleton({super.key, this.layout = SkeletonLayout.cards, this.count = 3});
  final SkeletonLayout layout;
  final int count;

  Widget _card(BuildContext context, {double height = 132}) => Container(
    height: height,
    padding: const EdgeInsets.all(Space.card),
    decoration: BoxDecoration(
      color: context.colors.surface,
      borderRadius: BorderRadius.circular(Radii.card),
      border: Border.all(color: context.colors.border),
    ),
    child: const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SkeletonBlock(width: 96, height: 14),
        SizedBox(height: 14),
        SkeletonBlock(width: 180, height: 22),
        Spacer(),
        SkeletonBlock(height: 14),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) => Semantics(
    label: context.l10n.loading,
    liveRegion: true,
    child: ExcludeSemantics(
      child: switch (layout) {
        SkeletonLayout.grid => Column(
          children: [
            _card(context, height: 180),
            const SizedBox(height: Space.grid),
            BentoGrid(
              children: [
                for (var i = 0; i < 4; i++)
                  const SkeletonBlock(height: 120, radius: Radii.tile),
              ],
            ),
          ],
        ),
        SkeletonLayout.detail => Column(
          children: [
            _card(context, height: 220),
            const SizedBox(height: Space.grid),
            _card(context, height: 120),
            const SizedBox(height: Space.grid),
            _card(context, height: 120),
          ],
        ),
        SkeletonLayout.chat => Column(
          children: [
            for (var i = 0; i < count + 2; i++)
              Align(
                alignment: i.isEven
                    ? Alignment.centerLeft
                    : Alignment.centerRight,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: Space.md),
                  child: SkeletonBlock(
                    width: i.isEven ? 220 : 160,
                    height: 52,
                    radius: Radii.tile,
                  ),
                ),
              ),
          ],
        ),
        SkeletonLayout.cards => Column(
          children: [
            for (var i = 0; i < count; i++) ...[
              if (i > 0) const SizedBox(height: Space.md),
              _card(context),
            ],
          ],
        ),
      },
    ),
  );
}

/// Whole-screen loading state; scrolls so short viewports never overflow.
class SkeletonPage extends StatelessWidget {
  const SkeletonPage({super.key, this.layout = SkeletonLayout.detail});
  final SkeletonLayout layout;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(Space.page),
    children: [Skeleton(layout: layout)],
  );
}

/// Slim top banner while a cached list stays readable.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key, this.onRetry});
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return Semantics(
      liveRegion: true,
      child: Container(
        margin: const EdgeInsets.only(bottom: Space.md),
        padding: const EdgeInsets.fromLTRB(16, 6, 6, 6),
        decoration: BoxDecoration(
          color: p.warningSoft,
          borderRadius: BorderRadius.circular(Radii.control),
        ),
        child: Row(
          children: [
            Icon(Icons.wifi_off_rounded, size: 18, color: p.warning),
            const SizedBox(width: Space.sm),
            Expanded(
              child: Text(
                context.l10n.offlineBanner,
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: p.warning),
              ),
            ),
            if (onRetry != null)
              IconButton(
                tooltip: context.l10n.retry,
                onPressed: onRetry,
                icon: Icon(Icons.refresh, color: p.warning),
              ),
          ],
        ),
      ),
    );
  }
}

/// A section whose data source is not connected yet.
class UnavailableNotice extends StatelessWidget {
  const UnavailableNotice({super.key, this.action});
  final Widget? action;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 8),
    child: Column(
      children: [
        IconSquare(Icons.handyman_outlined, size: 64),
        const SizedBox(height: Space.md),
        Text(
          context.l10n.unavailableTitle,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: Space.xs),
        Text(
          context.l10n.unavailableDetail,
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: context.colors.secondary),
        ),
        if (action != null) ...[const SizedBox(height: Space.md), action!],
      ],
    ),
  );
}

/// Builds the right state for a failed load: unavailable, offline or error.
Widget failureView(
  BuildContext context,
  Object error, {
  VoidCallback? retry,
  Widget? unavailableAction,
}) {
  if (isUnavailable(error)) return UnavailableNotice(action: unavailableAction);
  return ErrorState(failureText(error), retry: retry);
}

/// Plain-language failure with a Retry pill.
class ErrorState extends StatelessWidget {
  const ErrorState(this.message, {super.key, this.retry});
  final String message;
  final VoidCallback? retry;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return BentoCard(
      color: p.dangerSoft,
      borderColor: Colors.transparent,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.error_outline, color: p.danger),
              const SizedBox(width: Space.md),
              Expanded(
                child: Semantics(
                  liveRegion: true,
                  child: Text(
                    context.message(message),
                    style: Theme.of(
                      context,
                    ).textTheme.bodyLarge?.copyWith(color: p.danger),
                  ),
                ),
              ),
            ],
          ),
          if (retry != null) ...[
            const SizedBox(height: Space.md),
            PillButton(
              label: context.l10n.retry,
              icon: Icons.refresh,
              kind: PillKind.secondary,
              onPressed: retry,
            ),
          ],
        ],
      ),
    );
  }
}

/// Line icon, one short sentence and the next step.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.detail,
    this.action,
  });
  final IconData icon;
  final String title;
  final String? detail;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 8),
    child: Column(
      children: [
        IconSquare(icon, size: 64),
        const SizedBox(height: Space.md),
        Text(
          title,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        if (detail != null) ...[
          const SizedBox(height: Space.xs),
          Text(
            detail!,
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: context.colors.secondary),
          ),
        ],
        if (action != null) ...[const SizedBox(height: Space.md), action!],
      ],
    ),
  );
}

/// Short confirmation after a save.
void toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(content: Text(message), duration: const Duration(seconds: 3)),
    );
}

/// Bottom-sheet confirmation for destructive actions.
Future<bool> confirmSheet(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  String? cancelLabel,
  IconData icon = Icons.warning_amber_rounded,
  bool destructive = true,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (context) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Space.page, 0, Space.page, Space.page),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: IconSquare(icon, tone: destructive ? 'danger' : null),
            ),
            const SizedBox(height: Space.md),
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: Space.sm),
            Text(
              message,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: context.colors.secondary,
              ),
            ),
            const SizedBox(height: Space.group),
            PillButton(
              label: confirmLabel,
              kind: destructive ? PillKind.danger : PillKind.primary,
              expand: true,
              onPressed: () => Navigator.pop(context, true),
            ),
            const SizedBox(height: Space.sm),
            PillButton(
              label: cancelLabel ?? context.l10n.stay,
              kind: PillKind.secondary,
              expand: true,
              onPressed: () => Navigator.pop(context, false),
            ),
          ],
        ),
      ),
    ),
  );
  return result ?? false;
}

/// Bottom sheet with one optional text field (cancel reason, completion note).
Future<String?> textSheet(
  BuildContext context, {
  required String title,
  required String label,
  required String confirmLabel,
  String? message,
  bool destructive = false,
  bool large = false,
  int maxLength = 1000,
}) => showModalBottomSheet<String>(
  context: context,
  isScrollControlled: true,
  builder: (context) => _TextSheet(
    title: title,
    label: label,
    confirmLabel: confirmLabel,
    message: message,
    destructive: destructive,
    large: large,
    maxLength: maxLength,
  ),
);

class _TextSheet extends StatefulWidget {
  const _TextSheet({
    required this.title,
    required this.label,
    required this.confirmLabel,
    required this.destructive,
    required this.large,
    required this.maxLength,
    this.message,
  });
  final String title, label, confirmLabel;
  final String? message;
  final bool destructive, large;
  final int maxLength;
  @override
  State<_TextSheet> createState() => _TextSheetState();
}

class _TextSheetState extends State<_TextSheet> {
  final text = TextEditingController();
  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final area = OutlineInputBorder(
      borderRadius: BorderRadius.circular(Radii.tile),
      borderSide: BorderSide(color: context.colors.border),
    );
    return Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
    child: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          Space.page,
          0,
          Space.page,
          Space.page,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.title, style: Theme.of(context).textTheme.titleLarge),
            if (widget.message != null) ...[
              const SizedBox(height: Space.sm),
              Text(
                widget.message!,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: context.colors.secondary,
                ),
              ),
            ],
            const SizedBox(height: Space.md),
            TextField(
              controller: text,
              maxLines: 3,
              maxLength: widget.maxLength,
              style: widget.large
                  ? Theme.of(context).textTheme.titleMedium
                  : null,
              decoration: InputDecoration(
                labelText: widget.label,
                alignLabelWithHint: true,
                border: area,
                enabledBorder: area,
                focusedBorder: area.copyWith(
                  borderSide: BorderSide(color: context.colors.brand, width: 2),
                ),
              ),
            ),
            const SizedBox(height: Space.md),
            PillButton(
              label: widget.confirmLabel,
              kind: widget.destructive ? PillKind.danger : PillKind.primary,
              expand: true,
              large: widget.large,
              onPressed: () => Navigator.pop(context, text.text.trim()),
            ),
            const SizedBox(height: Space.sm),
            PillButton(
              label: context.l10n.stay,
              kind: PillKind.secondary,
              expand: true,
              large: widget.large,
              onPressed: () => Navigator.pop(context),
            ),
          ],
        ),
      ),
    ),
  );
  }
}

/// Six visual boxes over one real, accessible text field.
class OtpField extends StatefulWidget {
  const OtpField({
    super.key,
    required this.controller,
    required this.label,
    this.length = 6,
    this.enabled = true,
    this.onCompleted,
    this.error,
  });
  final TextEditingController controller;
  final String label;
  final int length;
  final bool enabled;
  final ValueChanged<String>? onCompleted;
  final String? error;
  @override
  State<OtpField> createState() => _OtpFieldState();
}

class _OtpFieldState extends State<OtpField> {
  final focus = FocusNode();
  @override
  void dispose() {
    focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return ValueListenableBuilder<TextEditingValue>(
      valueListenable: widget.controller,
      builder: (context, value, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              Row(
                children: [
                  for (var i = 0; i < widget.length; i++) ...[
                    if (i > 0) const SizedBox(width: Space.sm),
                    Expanded(
                      child: AspectRatio(
                        aspectRatio: .86,
                        child: Container(
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: p.muted,
                            borderRadius: BorderRadius.circular(Radii.tile),
                            border: Border.all(
                              color: widget.error != null
                                  ? p.danger
                                  : focus.hasFocus &&
                                        i ==
                                            value.text.length.clamp(
                                              0,
                                              widget.length - 1,
                                            )
                                  ? p.brand
                                  : p.border,
                              width: 1.5,
                            ),
                          ),
                          child: Text(
                            i < value.text.length ? value.text[i] : '',
                            style: context.numeral(24),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              Positioned.fill(
                child: Opacity(
                  opacity: 0.01,
                  child: TextField(
                    controller: widget.controller,
                    focusNode: focus,
                    enabled: widget.enabled,
                    keyboardType: TextInputType.number,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    maxLength: widget.length,
                    showCursor: false,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(
                      labelText: widget.label,
                      counterText: '',
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      filled: false,
                    ),
                    onTap: () => setState(() {}),
                    onChanged: (text) {
                      setState(() {});
                      if (text.length == widget.length) {
                        widget.onCompleted?.call(text);
                      }
                    },
                  ),
                ),
              ),
            ],
          ),
          if (widget.error != null) ...[
            const SizedBox(height: Space.sm),
            Text(
              widget.error!,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: p.danger),
            ),
          ],
        ],
      ),
    );
  }
}
