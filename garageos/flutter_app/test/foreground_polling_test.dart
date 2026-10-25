import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garageos_staff/design/foreground_polling.dart';

class _Probe extends StatefulWidget {
  const _Probe({super.key});
  @override
  State<_Probe> createState() => _ProbeState();
}

class _ProbeState extends State<_Probe> with ForegroundPolling {
  int calls = 0;
  @override
  bool get pollingEnabled => true;
  @override
  Future<void> poll() async {
    calls++;
  }

  @override
  Widget build(BuildContext context) => const Scaffold(body: Text('probe'));
}

void main() {
  testWidgets(
    'polling stops in background and under another route, then resumes',
    (tester) async {
      final key = GlobalKey<_ProbeState>();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(
        MaterialApp(
          navigatorObservers: [pageObserver],
          home: _Probe(key: key),
        ),
      );
      await tester.pump(const Duration(seconds: 5));
      expect(key.currentState!.calls, 1);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump(const Duration(seconds: 20));
      expect(key.currentState!.calls, 1);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump(const Duration(seconds: 5));
      expect(key.currentState!.calls, 2);
      final navigator = tester.state<NavigatorState>(find.byType(Navigator));
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('covered')),
        ),
      );
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 10));
      expect(key.currentState!.calls, 2);
      navigator.pop();
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 5));
      expect(key.currentState!.calls, 3);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
