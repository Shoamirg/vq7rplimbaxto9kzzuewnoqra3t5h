import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../../data/api_client.dart';
import '../../domain/portal.dart';

abstract interface class LocationSource {
  Future<GeoPoint> current();
}

class DeviceLocationSource implements LocationSource {
  const DeviceLocationSource();
  @override
  Future<GeoPoint> current() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const AppFailure('Joylashuv xizmatini yoqing.');
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw const AppFailure('Joylashuvga ruxsat bering.');
    }
    try {
      final settings =
          !kIsWeb && defaultTargetPlatform == TargetPlatform.android
          ? AndroidSettings(
              forceLocationManager: true,
              accuracy: LocationAccuracy.high,
              timeLimit: const Duration(seconds: 20),
            )
          : const LocationSettings(
              accuracy: LocationAccuracy.high,
              timeLimit: Duration(seconds: 20),
            );
      final position = await Geolocator.getCurrentPosition(
        locationSettings: settings,
      );
      return GeoPoint(position.latitude, position.longitude);
    } on TimeoutException {
      throw const AppFailure(
        'Joylashuv aniqlanmadi. Ochiq joyda qayta urinib ko‘ring.',
      );
    }
  }
}
