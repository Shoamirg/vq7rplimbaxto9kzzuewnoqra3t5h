import 'dart:async';

import 'package:flutter/material.dart';

final pageObserver = RouteObserver<ModalRoute<void>>();

/// Poll only the visible page while the Android app is in the foreground.
mixin ForegroundPolling<T extends StatefulWidget> on State<T>
    implements RouteAware {
  Timer? _pollTimer;
  AppLifecycleListener? _appLifecycle;
  ModalRoute<void>? _pollRoute;
  bool _pollVisible = true, _pollBusy = false;
  bool get pollingEnabled;
  Future<void> poll();
  void restartPolling() => _configurePolling();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (_pollRoute != route) {
      if (_pollRoute != null) pageObserver.unsubscribe(this);
      _pollRoute = route;
      if (route != null) pageObserver.subscribe(this, route);
    }
    _appLifecycle ??= AppLifecycleListener(
      onStateChange: (_) => _configurePolling(),
    );
    _configurePolling();
  }

  void _configurePolling() {
    _pollTimer?.cancel();
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    if (!pollingEnabled ||
        !_pollVisible ||
        (lifecycle != null && lifecycle != AppLifecycleState.resumed)) {
      return;
    }
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      if (_pollBusy || !mounted) return;
      _pollBusy = true;
      try {
        await poll();
      } finally {
        _pollBusy = false;
      }
    });
  }

  @override
  void didPush() {
    _pollVisible = true;
    _configurePolling();
  }

  @override
  void didPopNext() {
    _pollVisible = true;
    _configurePolling();
  }

  @override
  void didPushNext() {
    _pollVisible = false;
    _configurePolling();
  }

  @override
  void didPop() {
    _pollVisible = false;
    _configurePolling();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _appLifecycle?.dispose();
    pageObserver.unsubscribe(this);
    super.dispose();
  }
}
