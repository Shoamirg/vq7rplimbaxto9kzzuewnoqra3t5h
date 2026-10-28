import 'package:flutter/material.dart';

import 'theme.dart';

/// GarageOS "Live G": a bold G ring whose open end carries an emerald status
/// dot. Same geometry as the web mark (64×64 view box).
class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 32, this.tone, this.accent});
  final double size;
  final Color? tone, accent;
  static const emerald = Color(0xFF109868);
  @override
  Widget build(BuildContext context) => Semantics(
    label: 'GarageOS',
    image: true,
    child: CustomPaint(
      size: Size.square(size),
      painter: _MarkPainter(tone ?? context.colors.text, accent ?? emerald),
    ),
  );
}

class _MarkPainter extends CustomPainter {
  const _MarkPainter(this.tone, this.accent);
  final Color tone, accent;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 64);
    final ring = Path()
      ..moveTo(46.5, 21.5)
      ..arcToPoint(
        const Offset(49, 36),
        radius: const Radius.circular(17),
        largeArc: true,
        clockwise: false,
      )
      ..lineTo(35, 36);
    canvas.drawPath(
      ring,
      Paint()
        ..color = tone
        ..style = PaintingStyle.stroke
        ..strokeWidth = 6.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawCircle(
      const Offset(46.5, 21.5),
      3.15,
      Paint()
        ..color = accent
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.9,
    );
  }

  @override
  bool shouldRepaint(_MarkPainter old) =>
      old.tone != tone || old.accent != accent;
}

/// The mark inside the obsidian app tile.
class LogoTile extends StatelessWidget {
  const LogoTile({super.key, this.size = 72});
  final double size;
  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: Palette.action,
      borderRadius: BorderRadius.circular(size * .25),
      border: context.isDark ? Border.all(color: context.colors.border) : null,
    ),
    child: LogoMark(size: size, tone: const Color(0xFFF5F6F8)),
  );
}

/// Mark + "GarageOS" wordmark.
class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.size = 24});
  final double size;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      LogoMark(size: size * 1.5),
      SizedBox(width: size * .35),
      ExcludeSemantics(
        child: Text.rich(
          TextSpan(
            text: 'Garage',
            children: [
              TextSpan(
                text: 'OS',
                style: TextStyle(
                  color: context.isDark
                      ? context.colors.success
                      : Palette.emerald,
                ),
              ),
            ],
          ),
          style: context.numeral(size).copyWith(letterSpacing: -.6),
        ),
      ),
    ],
  );
}
