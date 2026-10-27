import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'theme.dart';

/// Outer surface: 28px radius, 24px padding, 1px soft border, flat.
class BentoCard extends StatelessWidget {
  const BentoCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(Space.card),
    this.color,
    this.borderColor,
    this.elevated = false,
    this.semanticLabel,
  });
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final Color? color, borderColor;

  /// White card with the one subtle shadow the system allows.
  final bool elevated;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(Radii.card),
      side: BorderSide(color: borderColor ?? p.border),
    );
    Widget card = Material(
      color: color ?? (elevated ? p.elevated : p.surface),
      shape: shape,
      clipBehavior: Clip.antiAlias,
      child: onTap == null
          ? Padding(padding: padding, child: child)
          : InkWell(
              onTap: onTap,
              child: Padding(padding: padding, child: child),
            ),
    );
    if (elevated) {
      card = DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(Radii.card),
          boxShadow: const [
            BoxShadow(
              color: Color(0x14111315),
              blurRadius: 24,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: card,
      );
    }
    return semanticLabel == null
        ? card
        : Semantics(
            label: semanticLabel,
            button: onTap != null,
            container: true,
            child: card,
          );
  }
}

/// Nested 18px tile: top icon, muted label, bold value.
class BentoTile extends StatelessWidget {
  const BentoTile({
    super.key,
    required this.label,
    this.value,
    this.icon,
    this.tone,
    this.onTap,
    this.valueWidget,
    this.footer,
    this.color,
  });
  final String label;
  final String? value;
  final IconData? icon;
  final String? tone;
  final VoidCallback? onTap;
  final Widget? valueWidget, footer;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final content = Padding(
      padding: const EdgeInsets.all(Space.tile),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            IconSquare(icon!, tone: tone, size: 40),
            const SizedBox(height: Space.md),
          ],
          Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: p.secondary),
          ),
          const SizedBox(height: Space.xs),
          if (valueWidget != null)
            valueWidget!
          else if (value != null)
            Text(
              value!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: context.numeral(22),
            ),
          if (footer != null) ...[const SizedBox(height: Space.sm), footer!],
        ],
      ),
    );
    return Material(
      color: color ?? p.muted,
      borderRadius: BorderRadius.circular(Radii.tile),
      clipBehavior: Clip.antiAlias,
      child: onTap == null
          ? content
          : InkWell(onTap: onTap, child: content),
    );
  }
}

/// Two columns with an 18px gap. Rows share a height and stay close to
/// square, but grow when Russian labels wrap.
class BentoGrid extends StatelessWidget {
  const BentoGrid({super.key, required this.children, this.square = true});
  final List<Widget> children;
  final bool square;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final width = (constraints.maxWidth - Space.grid) / 2;
      final rows = <Widget>[];
      for (var i = 0; i < children.length; i += 2) {
        final pair = children.skip(i).take(2).toList();
        rows.add(
          ConstrainedBox(
            constraints: BoxConstraints(minHeight: square ? width * .82 : 0),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(child: pair[0]),
                  const SizedBox(width: Space.grid),
                  Expanded(
                    child: pair.length > 1 ? pair[1] : const SizedBox(),
                  ),
                ],
              ),
            ),
          ),
        );
      }
      return Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const SizedBox(height: Space.grid),
            rows[i],
          ],
        ],
      );
    },
  );
}

(Color, Color) toneColors(BuildContext context, String? tone) {
  final p = context.colors;
  return switch (tone) {
    'success' => (p.success, p.successSoft),
    'warning' => (p.warning, p.warningSoft),
    'danger' => (p.danger, p.dangerSoft),
    'strong' => (p.onBrand, p.brand),
    _ => (p.text, context.isDark ? p.brandSoft : p.elevated),
  };
}

/// 14px-radius icon container.
class IconSquare extends StatelessWidget {
  const IconSquare(this.icon, {super.key, this.tone, this.size = 44});
  final IconData icon;
  final String? tone;
  final double size;
  @override
  Widget build(BuildContext context) {
    final (fg, bg) = toneColors(context, tone);
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(Radii.icon),
        ),
        child: Icon(icon, size: size * .5, color: fg),
      ),
    );
  }
}

enum PillKind { primary, emerald, danger, secondary, quiet }

/// Every action is a pill. [large] is the 64px workshop target.
class PillButton extends StatelessWidget {
  const PillButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.kind = PillKind.primary,
    this.large = false,
    this.expand = false,
    this.busy = false,
  });
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final PillKind kind;
  final bool large, expand, busy;

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final height = large ? Touch.mechanic : Space.buttonHeight;
    final text = (large
        ? Theme.of(context).textTheme.titleMedium
        : Theme.of(context).textTheme.labelLarge);
    final (Color bg, Color fg) = switch (kind) {
      PillKind.emerald =>
        context.isDark ? (p.success, p.onBrand) : (Palette.emerald, p.onBrand),
      PillKind.danger =>
        context.isDark ? (p.danger, p.onBrand) : (Palette.sos, p.onBrand),
      PillKind.secondary => (p.elevated, p.text),
      PillKind.quiet => (Colors.transparent, p.text),
      PillKind.primary => (p.brand, p.onBrand),
    };
    final child = busy
        ? SizedBox.square(
            dimension: 22,
            child: CircularProgressIndicator(strokeWidth: 2, color: fg),
          )
        : Row(
            mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: large ? 24 : 20),
                const SizedBox(width: Space.sm),
              ],
              Flexible(
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          );
    final style = ButtonStyle(
      minimumSize: WidgetStatePropertyAll(
        Size(expand ? double.infinity : Touch.standard, height),
      ),
      padding: WidgetStatePropertyAll(
        EdgeInsets.symmetric(horizontal: large ? 28 : 20, vertical: 12),
      ),
      textStyle: WidgetStatePropertyAll(text),
      backgroundColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.disabled)
            ? (kind == PillKind.quiet ? Colors.transparent : p.muted)
            : bg,
      ),
      foregroundColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.disabled) ? p.secondary : fg,
      ),
      side: WidgetStatePropertyAll(
        kind == PillKind.secondary
            ? BorderSide(color: p.border)
            : BorderSide.none,
      ),
      shape: const WidgetStatePropertyAll(StadiumBorder()),
      elevation: const WidgetStatePropertyAll(0),
    );
    final onTap = busy ? null : onPressed;
    return kind == PillKind.secondary
        ? OutlinedButton(onPressed: onTap, style: style, child: child)
        : kind == PillKind.quiet
        ? TextButton(onPressed: onTap, style: style, child: child)
        : FilledButton(onPressed: onTap, style: style, child: child);
  }
}

/// Monospace pill for plates, VINs and document codes.
class MonoBadge extends StatelessWidget {
  const MonoBadge(
    this.text, {
    super.key,
    this.icon,
    this.semanticLabel,
    this.inverse = false,
    this.size = 14,
  });
  final String text;
  final IconData? icon;
  final String? semanticLabel;
  final bool inverse;
  final double size;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final fg = inverse ? const Color(0xFFECEEF1) : p.text;
    return Semantics(
      label: semanticLabel,
      excludeSemantics: semanticLabel != null,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: inverse ? const Color(0x1FFFFFFF) : p.elevated,
          border: Border.all(
            color: inverse ? const Color(0x33FFFFFF) : p.border,
          ),
          borderRadius: BorderRadius.circular(Radii.plate),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: size + 2, color: fg),
              const SizedBox(width: 6),
            ],
            Flexible(
              child: Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.mono(size: size, color: fg),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String healthTone(int score) => score >= 75
    ? 'success'
    : score >= 50
    ? 'warning'
    : 'danger';

/// Circular 0–100 gauge.
class HealthRing extends StatelessWidget {
  const HealthRing({
    super.key,
    required this.score,
    this.size = 120,
    this.stroke = 10,
    this.semanticLabel,
    this.caption,
  });
  final int score;
  final double size, stroke;
  final String? semanticLabel, caption;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final value = score.clamp(0, 100);
    final (fg, _) = toneColors(context, healthTone(value));
    return Semantics(
      label: semanticLabel ?? '$value / 100',
      excludeSemantics: true,
      child: SizedBox.square(
        dimension: size,
        child: CustomPaint(
          painter: _RingPainter(value / 100, fg, p.border, stroke),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('$value', style: context.numeral(size * .28)),
                Text(
                  caption ?? '/100',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: p.secondary,
                    fontSize: math.max(11, size * .1),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter(this.value, this.color, this.track, this.stroke);
  final double value, stroke;
  final Color color, track;
  @override
  void paint(Canvas canvas, Size size) {
    final rect = (Offset.zero & size).deflate(stroke / 2);
    final base = Paint()
      ..color = track
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(rect, math.pi * .75, math.pi * 1.5, false, base);
    if (value > 0) {
      canvas.drawArc(
        rect,
        math.pi * .75,
        math.pi * 1.5 * value,
        false,
        base..color = color,
      );
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.value != value || old.color != color || old.track != track;
}

/// Pill segmented control. Labels wrap to two lines instead of clipping.
class PillSegments<T> extends StatelessWidget {
  const PillSegments({
    super.key,
    required this.values,
    required this.selected,
    required this.label,
    required this.onChanged,
    this.counts,
    this.semanticLabel,
  });
  final List<T> values;
  final T selected;
  final String Function(T value) label;
  final ValueChanged<T>? onChanged;
  final int? Function(T value)? counts;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final style = Theme.of(
      context,
    ).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600);
    final scaler = MediaQuery.textScalerOf(context);
    Widget segment(T value) => _Segment(
      label: label(value),
      count: counts?.call(value),
      selected: value == selected,
      onTap: onChanged == null ? null : () => onChanged!(value),
    );
    return Semantics(
      label: semanticLabel,
      container: true,
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: p.muted,
          borderRadius: BorderRadius.circular(Radii.control),
          border: Border.all(color: p.border),
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            // Equal segments while every label fits whole; otherwise a
            // scrolling row of natural-width pills, so words never break.
            final share = constraints.maxWidth / values.length - 28;
            final fits = values.every((value) {
              final count = counts?.call(value);
              final painter = TextPainter(
                text: TextSpan(
                  text: count == null ? label(value) : '${label(value)} $count',
                  style: style,
                ),
                textScaler: scaler,
                textDirection: Directionality.of(context),
              )..layout();
              final width = painter.width;
              painter.dispose();
              return width <= share;
            });
            if (fits) {
              return Row(
                children: [
                  for (final value in values) Expanded(child: segment(value)),
                ],
              );
            }
            return SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [for (final value in values) segment(value)],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.selected,
    required this.onTap,
    this.count,
  });
  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final int? count;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final fg = selected ? p.onBrand : p.secondary;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? p.brand : Colors.transparent,
        shape: const StadiumBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: Touch.standard),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              child: Center(
                child: Text.rich(
                  TextSpan(
                    text: label,
                    children: [
                      if (count != null)
                        TextSpan(
                          text: ' $count',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: selected ? p.onBrand : p.text,
                          ),
                        ),
                    ],
                  ),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: fg,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Small rounded filter pill used in horizontal rows (status counters).
class CountPill extends StatelessWidget {
  const CountPill({
    super.key,
    required this.label,
    required this.count,
    this.tone,
    this.selected = false,
    this.onTap,
    this.icon,
  });
  final String label;
  final int count;
  final String? tone;
  final bool selected;
  final VoidCallback? onTap;
  final IconData? icon;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final (fg, bg) = selected ? (p.onBrand, p.brand) : toneColors(context, tone);
    return Semantics(
      button: onTap != null,
      selected: selected,
      child: Material(
        color: bg,
        shape: StadiumBorder(side: BorderSide(color: selected ? p.brand : p.border)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: Touch.standard),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 18, color: fg),
                    const SizedBox(width: 6),
                  ],
                  Text(
                    label,
                    style: Theme.of(
                      context,
                    ).textTheme.labelMedium?.copyWith(color: fg),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '$count',
                    style: context.numeral(16, color: fg),
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

class DockItem {
  const DockItem(this.icon, this.label, {this.badge = 0, this.key});
  final IconData icon;
  final String label;
  final int badge;
  final Key? key;
}

/// Floating 24px squircle tab bar shared by every role.
class FloatingDock extends StatelessWidget {
  const FloatingDock({
    super.key,
    required this.items,
    required this.index,
    required this.onSelect,
    this.large = false,
  });
  final List<DockItem> items;
  final int index;
  final ValueChanged<int> onSelect;

  /// Mechanic dock: 64px targets for gloved hands.
  final bool large;

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    // Tab labels share one size; very large text settings would otherwise
    // shrink each label differently.
    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: 1.15,
      child: SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Center(
        heightFactor: 1,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: p.dock,
              borderRadius: BorderRadius.circular(Radii.dock),
              border: context.isDark ? Border.all(color: p.border) : null,
              boxShadow: const [
                BoxShadow(
                  color: Color(0x29111315),
                  blurRadius: 24,
                  offset: Offset(0, 10),
                ),
              ],
            ),
            child: Row(
              children: [
                for (var i = 0; i < items.length; i++)
                  Expanded(
                    child: _DockButton(
                      key: items[i].key,
                      item: items[i],
                      selected: i == index,
                      large: large,
                      onTap: () => onSelect(i),
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

class _DockButton extends StatelessWidget {
  const _DockButton({
    super.key,
    required this.item,
    required this.selected,
    required this.onTap,
    required this.large,
  });
  final DockItem item;
  final bool selected, large;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    const active = Color(0xFFF5F6F8), onActive = Color(0xFF111315);
    final fg = selected ? onActive : p.onDock;
    Widget icon = Icon(item.icon, color: fg, size: large ? 28 : 24);
    if (item.badge > 0) {
      icon = Badge(
        label: Text('${item.badge}'),
        backgroundColor: Palette.sos,
        textColor: Colors.white,
        child: icon,
      );
    }
    return Semantics(
      button: true,
      selected: selected,
      label: item.badge > 0 ? '${item.label}, ${item.badge}' : item.label,
      excludeSemantics: true,
      child: Material(
        color: selected ? active : Colors.transparent,
        borderRadius: BorderRadius.circular(Radii.tile),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: large ? 64 : 56),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 6),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  icon,
                  const SizedBox(height: 2),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      item.label,
                      maxLines: 1,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: fg,
                        fontWeight: selected
                            ? FontWeight.w700
                            : FontWeight.w500,
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

/// Floating bottom bar: value on the left, one pill action on the right.
class StickyActionBar extends StatelessWidget {
  const StickyActionBar({
    super.key,
    required this.label,
    required this.value,
    required this.action,
    this.above,
  });
  final String label, value;
  final Widget action;
  final Widget? above;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ?above,
          if (above != null) const SizedBox(height: Space.sm),
          DecoratedBox(
            decoration: BoxDecoration(
              color: p.elevated,
              borderRadius: BorderRadius.circular(Radii.control),
              border: Border.all(color: p.border),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x1A111315),
                  blurRadius: 20,
                  offset: Offset(0, 6),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 6, 6, 6),
              child: LayoutBuilder(
                builder: (context, constraints) => Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: p.secondary),
                          ),
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerLeft,
                            child: Text(value, style: context.numeral(20)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: Space.sm),
                    // The action keeps its words whole; the value scales.
                    ConstrainedBox(
                      constraints: BoxConstraints(
                        maxWidth: constraints.maxWidth * .62,
                      ),
                      child: action,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Oversized Archivo date/time with duration — the appointment signature.
class DateSlotCard extends StatelessWidget {
  const DateSlotCard({
    super.key,
    required this.day,
    required this.time,
    required this.duration,
    this.title,
    this.chip,
    this.footer,
    this.onTap,
    this.semanticLabel,
  });
  final String day, time, duration;
  final String? title;
  final Widget? chip, footer;
  final VoidCallback? onTap;
  final String? semanticLabel;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return BentoCard(
      onTap: onTap,
      semanticLabel: semanticLabel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null || chip != null)
            Wrap(
              spacing: Space.sm,
              runSpacing: Space.sm,
              crossAxisAlignment: WrapCrossAlignment.center,
              alignment: WrapAlignment.spaceBetween,
              children: [
                if (title != null)
                  Text(
                    title!,
                    style: Theme.of(
                      context,
                    ).textTheme.bodyMedium?.copyWith(color: p.secondary),
                  ),
                ?chip,
              ],
            ),
          const SizedBox(height: Space.md),
          // One line that scales down rather than orphaning the divider.
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(day, style: context.numeral(30)),
                const SizedBox(width: Space.md),
                Container(width: 1.5, height: 28, color: p.border),
                const SizedBox(width: Space.md),
                Text(time, style: context.numeral(30)),
              ],
            ),
          ),
          const SizedBox(height: Space.sm),
          Row(
            children: [
              Icon(Icons.timer_outlined, size: 18, color: p.secondary),
              const SizedBox(width: 6),
              Text(
                duration,
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: p.secondary),
              ),
            ],
          ),
          if (footer != null) ...[const SizedBox(height: Space.md), footer!],
        ],
      ),
    );
  }
}

/// High-contrast invoice card: code, paid, remaining and one emerald action.
class PaymentVault extends StatelessWidget {
  const PaymentVault({
    super.key,
    required this.code,
    required this.balanceLabel,
    required this.balance,
    required this.paidLabel,
    required this.paid,
    required this.totalLabel,
    required this.total,
    required this.progress,
    this.status,
    this.action,
  });
  final String code, balanceLabel, balance, paidLabel, paid, totalLabel, total;
  final double progress;
  final Widget? status, action;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    const fg = Color(0xFFECEEF1), muted = Color(0xFFB1BCCD);
    final small = Theme.of(context).textTheme.bodySmall?.copyWith(color: muted);
    return Container(
      padding: const EdgeInsets.all(Space.card),
      decoration: BoxDecoration(
        color: p.vault,
        borderRadius: BorderRadius.circular(Radii.card),
        border: context.isDark ? Border.all(color: p.border) : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              MonoBadge(code, inverse: true, icon: Icons.receipt_long_outlined),
              ?status,
            ],
          ),
          const SizedBox(height: Space.group),
          Text(balanceLabel, style: small),
          const SizedBox(height: Space.xs),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(balance, style: context.numeral(30, color: fg)),
          ),
          const SizedBox(height: Space.md),
          ClipRRect(
            borderRadius: BorderRadius.circular(Radii.control),
            child: LinearProgressIndicator(
              value: progress.clamp(0, 1),
              minHeight: 6,
              backgroundColor: const Color(0x33FFFFFF),
              color: const Color(0xFF75D5A3),
              semanticsLabel: paidLabel,
            ),
          ),
          const SizedBox(height: Space.md),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(paidLabel, style: small),
                    Text(paid, style: context.numeral(16, color: fg)),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(totalLabel, style: small),
                    Text(total, style: context.numeral(16, color: fg)),
                  ],
                ),
              ),
            ],
          ),
          if (action != null) ...[const SizedBox(height: Space.group), action!],
        ],
      ),
    );
  }
}

/// Section heading with an optional trailing action.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Space.group, bottom: Space.md),
    child: Row(
      children: [
        Expanded(
          child: Semantics(
            header: true,
            child: Text(text, style: Theme.of(context).textTheme.titleMedium),
          ),
        ),
        ?trailing,
      ],
    ),
  );
}

/// Label/value line used inside cards and tiles.
class InfoLine extends StatelessWidget {
  const InfoLine({
    super.key,
    required this.icon,
    required this.text,
    this.mono = false,
  });
  final IconData icon;
  final String text;
  final bool mono;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: context.colors.secondary),
        const SizedBox(width: Space.sm),
        Expanded(
          child: Text(
            text,
            style: mono
                ? context.mono()
                : Theme.of(context).textTheme.bodyMedium,
          ),
        ),
      ],
    ),
  );
}
