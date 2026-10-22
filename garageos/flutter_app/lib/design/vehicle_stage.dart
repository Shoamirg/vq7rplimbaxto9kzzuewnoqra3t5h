import 'package:flutter/material.dart';

import 'theme.dart';

/// Decorative, generic vehicle diagram. It does not imply a photograph or
/// diagnostic measurement for the customer's specific vehicle.
class VehicleStage extends StatelessWidget {
  const VehicleStage({super.key, this.blueprint = false});
  final bool blueprint;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: AspectRatio(
      aspectRatio: 3,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(Radii.tile),
        child: CustomPaint(painter: _VehiclePainter(context.colors, blueprint)),
      ),
    ),
  );
}

class _VehiclePainter extends CustomPainter {
  const _VehiclePainter(this.palette, this.blueprint);
  final Palette palette;
  final bool blueprint;

  @override
  void paint(Canvas canvas, Size size) {
    final bounds = Offset.zero & size;
    canvas.drawRect(bounds, Paint()..color = palette.muted);
    if (blueprint) {
      final grid = Paint()
        ..color = palette.border
        ..strokeWidth = .6;
      for (double x = 0; x < size.width; x += 24) {
        canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
      }
      for (double y = 0; y < size.height; y += 24) {
        canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
      }
    }
    canvas.save();
    canvas.scale(size.width / 640, size.height / 240);
    canvas.drawOval(
      const Rect.fromLTWH(68, 205, 510, 12),
      Paint()
        ..color = const Color(0x22111315)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 7),
    );
    final body = Path()
      ..moveTo(60, 183)
      ..lineTo(72, 145)
      ..lineTo(163, 128)
      ..lineTo(233, 84)
      ..quadraticBezierTo(244, 76, 275, 76)
      ..lineTo(398, 76)
      ..quadraticBezierTo(433, 76, 482, 132)
      ..lineTo(554, 149)
      ..quadraticBezierTo(577, 154, 579, 178)
      ..lineTo(579, 200)
      ..lineTo(60, 200)
      ..close();
    canvas.drawPath(
      body,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFFFFFFF), Color(0xFFD8DCDF), Color(0xFF949A9F)],
        ).createShader(const Rect.fromLTWH(60, 76, 519, 124)),
    );
    final glass = Paint()..color = const Color(0xFF2B3036);
    canvas.drawPath(
      Path()
        ..moveTo(185, 126)
        ..lineTo(240, 90)
        ..lineTo(300, 90)
        ..lineTo(300, 126)
        ..close(),
      glass,
    );
    canvas.drawPath(
      Path()
        ..moveTo(313, 90)
        ..lineTo(398, 90)
        ..quadraticBezierTo(422, 92, 456, 126)
        ..lineTo(313, 126)
        ..close(),
      glass,
    );
    final line = Paint()
      ..color = const Color(0xFF686E76)
      ..strokeWidth = 2;
    canvas.drawLine(const Offset(307, 137), const Offset(307, 196), line);
    canvas.drawLine(const Offset(255, 143), const Offset(277, 143), line);
    canvas.drawLine(const Offset(407, 143), const Offset(429, 143), line);
    for (final x in [190.0, 474.0]) {
      final center = Offset(x, 191);
      canvas.drawCircle(center, 32, Paint()..color = const Color(0xFF181B20));
      canvas.drawCircle(center, 23, Paint()..color = const Color(0xFF949A9F));
      canvas.drawCircle(center, 9, Paint()..color = const Color(0xFF2B3036));
      canvas.drawCircle(
        center,
        23,
        Paint()
          ..color = const Color(0xFFD0D5DD)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
    }
    if (blueprint) {
      final leader = Paint()
        ..color = palette.secondary
        ..strokeWidth = 1;
      canvas.drawLine(const Offset(150, 126), const Offset(108, 38), leader);
      canvas.drawLine(const Offset(108, 38), const Offset(32, 38), leader);
      canvas.drawLine(const Offset(480, 126), const Offset(520, 38), leader);
      canvas.drawLine(const Offset(520, 38), const Offset(608, 38), leader);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_VehiclePainter oldDelegate) =>
      oldDelegate.palette != palette || oldDelegate.blueprint != blueprint;
}
