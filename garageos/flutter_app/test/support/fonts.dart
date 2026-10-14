import 'package:flutter/services.dart';

Future<void> loadGarageFonts() async {
  for (final (family, paths) in [
    ('Golos Text', ['assets/fonts/GolosText.ttf']),
    (
      'DM Sans',
      [
        'assets/fonts/DMSans-Regular.ttf',
        'assets/fonts/DMSans-Medium.ttf',
        'assets/fonts/DMSans-SemiBold.ttf',
        'assets/fonts/DMSans-Bold.ttf',
      ],
    ),
    ('Plus Jakarta Sans', [
      'assets/fonts/PlusJakartaSans-400.ttf',
      'assets/fonts/PlusJakartaSans-500.ttf',
      'assets/fonts/PlusJakartaSans-SemiBold.ttf',
      'assets/fonts/PlusJakartaSans-700.ttf',
    ]),
    ('Archivo', ['assets/fonts/Archivo-600.ttf', 'assets/fonts/Archivo-700.ttf']),
    ('IBM Plex Mono', ['assets/fonts/IBMPlexMono-400.ttf']),
    ('MaterialIcons', ['fonts/MaterialIcons-Regular.otf']),
  ]) {
    final loader = FontLoader(family);
    for (final path in paths) {
      loader.addFont(rootBundle.load(path));
    }
    await loader.load();
  }
}
