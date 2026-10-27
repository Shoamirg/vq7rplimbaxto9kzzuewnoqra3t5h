import 'package:flutter/foundation.dart';

String defaultApiAddress() => const String.fromEnvironment('API_URL') != ''
    ? const String.fromEnvironment('API_URL')
    : !kIsWeb && defaultTargetPlatform == TargetPlatform.android
    ? 'http://10.0.2.2:8000/api/v1'
    : 'http://127.0.0.1:8000/api/v1';
