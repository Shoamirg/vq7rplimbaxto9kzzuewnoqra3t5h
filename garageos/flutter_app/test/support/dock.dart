import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/design/bento.dart';

/// A tab in the floating dock, by its visible label.
Finder dockTab(String label) =>
    find.descendant(of: find.byType(FloatingDock), matching: find.text(label));

/// A segment of a pill segmented control, by its visible label (segments
/// may append a count).
Finder segment(String label) => find.descendant(
  of: find.byWidgetPredicate((w) => w is PillSegments),
  matching: find.textContaining(RegExp('^${RegExp.escape(label)}( \\d+)?\$')),
);

/// Long labels turn segments into a scrolling row; bring the segment into
/// view before tapping, as a person would.
Future<void> tapSegment(WidgetTester tester, String label) async {
  await tester.ensureVisible(segment(label));
  await tester.pumpAndSettle();
  await tester.tap(segment(label));
  await tester.pumpAndSettle();
}
