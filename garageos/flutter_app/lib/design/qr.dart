import 'package:flutter/material.dart';
import 'package:qr/qr.dart';

import 'theme.dart';

/// Scannable QR code. Always dark modules on a white plate so cameras read
/// it in either theme.
class QrSeal extends StatelessWidget {
  const QrSeal({
    super.key,
    required this.data,
    required this.semanticLabel,
    this.size = 132,
  });
  final String data, semanticLabel;
  final double size;
  @override
  Widget build(BuildContext context) {
    final image = QrImage(QrCode(payload: QrPayload.fromString(data)));
    return Semantics(
      label: semanticLabel,
      image: true,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(Radii.icon),
          border: Border.all(color: context.colors.border),
        ),
        child: CustomPaint(
          size: Size.square(size),
          painter: _QrPainter(image),
        ),
      ),
    );
  }
}

class _QrPainter extends CustomPainter {
  const _QrPainter(this.image);
  final QrImage image;
  @override
  void paint(Canvas canvas, Size size) {
    final count = image.moduleCount;
    final cell = size.width / count;
    final paint = Paint()..color = const Color(0xFF111315);
    for (var y = 0; y < count; y++) {
      for (var x = 0; x < count; x++) {
        if (image.isDark(y, x)) {
          canvas.drawRect(
            Rect.fromLTWH(x * cell, y * cell, cell + .3, cell + .3),
            paint,
          );
        }
      }
    }
  }

  @override
  bool shouldRepaint(_QrPainter old) => old.image != image;
}
