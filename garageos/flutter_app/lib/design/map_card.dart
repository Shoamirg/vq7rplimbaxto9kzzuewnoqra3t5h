import 'package:flutter/material.dart';

import 'bento.dart';
import 'theme.dart';

/// Blueprint-style location card: street grid, pin and coordinates. It marks
/// the shared position; it is not a navigable map.
class MapPinCard extends StatelessWidget {
  const MapPinCard({
    super.key,
    required this.latitude,
    required this.longitude,
    required this.semanticLabel,
    this.address,
    this.footer,
  });
  final double latitude, longitude;
  final String semanticLabel;
  final String? address;
  final Widget? footer;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return BentoCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            label: semanticLabel,
            image: true,
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: CustomPaint(
                painter: _StreetPainter(p.muted, p.border, p.secondary),
                child: const Center(child: _Pin()),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(Space.tile),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (address != null)
                  Text(address!, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: Space.xs),
                Text(
                  '${latitude.toStringAsFixed(4)}° N · ${longitude.toStringAsFixed(4)}° E',
                  style: context.mono(size: 13, color: p.secondary),
                ),
                if (footer != null) ...[
                  const SizedBox(height: Space.md),
                  footer!,
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Pin extends StatelessWidget {
  const _Pin();
  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: Palette.sos,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 3),
          boxShadow: const [
            BoxShadow(color: Color(0x40BE312B), blurRadius: 0, spreadRadius: 10),
          ],
        ),
        child: const Icon(Icons.directions_car_filled, color: Colors.white, size: 20),
      ),
      Container(width: 3, height: 14, color: Palette.sos),
    ],
  );
}

class _StreetPainter extends CustomPainter {
  const _StreetPainter(this.ground, this.street, this.river);
  final Color ground, street, river;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = ground);
    final minor = Paint()
      ..color = street
      ..strokeWidth = 1;
    for (double x = 12; x < size.width; x += 28) {
      canvas.drawLine(Offset(x, 0), Offset(x - 18, size.height), minor);
    }
    for (double y = 10; y < size.height; y += 26) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y + 8), minor);
    }
    final main = Paint()
      ..color = street
      ..strokeWidth = 9
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(
      Offset(0, size.height * .62),
      Offset(size.width, size.height * .48),
      main,
    );
    canvas.drawLine(
      Offset(size.width * .36, 0),
      Offset(size.width * .3, size.height),
      main,
    );
    final canal = Path()
      ..moveTo(size.width * .72, 0)
      ..cubicTo(
        size.width * .62,
        size.height * .3,
        size.width * .9,
        size.height * .55,
        size.width * .8,
        size.height,
      );
    canvas.drawPath(
      canal,
      Paint()
        ..color = river.withValues(alpha: .25)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 6,
    );
  }

  @override
  bool shouldRepaint(_StreetPainter old) =>
      old.ground != ground || old.street != street;
}
