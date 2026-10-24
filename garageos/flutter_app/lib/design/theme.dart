import 'package:flutter/material.dart';

abstract final class Space {
  static const xs = 4.0,
      sm = 8.0,
      md = 12.0,
      page = 20.0,
      grid = 18.0,
      tile = 18.0,
      card = 24.0,
      group = 24.0,
      section = 32.0;
  static const contentWidth = 960.0, tablet = 720.0, buttonHeight = 52.0;

  /// Room the floating dock covers at the bottom of a tab's scroll view.
  static const dockClearance = 112.0;
}

abstract final class Touch {
  static const standard = 48.0, mechanic = 64.0;
}

abstract final class Radii {
  static const card = 28.0,
      tile = 18.0,
      dock = 24.0,
      icon = 14.0,
      control = 9999.0,
      plate = 9999.0;
}

@immutable
class Palette extends ThemeExtension<Palette> {
  const Palette({
    required this.background,
    required this.surface,
    required this.muted,
    required this.border,
    required this.text,
    required this.secondary,
    required this.brand,
    required this.brandSoft,
    required this.onBrand,
    required this.success,
    required this.successSoft,
    required this.warning,
    required this.warningSoft,
    required this.danger,
    required this.dangerSoft,
    required this.info,
    required this.infoSoft,
    required this.elevated,
    required this.dock,
    required this.onDock,
    required this.vault,
  });
  final Color background,
      surface,
      muted,
      border,
      text,
      secondary,
      brand,
      brandSoft,
      onBrand,
      success,
      successSoft,
      warning,
      warningSoft,
      danger,
      dangerSoft,
      info,
      infoSoft,
      elevated,
      dock,
      onDock,
      vault;
  static const action = Color(0xFF111315), onAction = Color(0xFFFFFFFF);

  /// White-text emerald for money and send actions (AA on white text).
  static const emerald = Color(0xFF0B7E55);
  static const sos = Color(0xFFBE312B);
  static const light = Palette(
    background: Color(0xFFE4E6E9),
    surface: Color(0xFFF5F6F8),
    muted: Color(0xFFECEEF1),
    border: Color(0xFFDCDFE4),
    text: Color(0xFF111315),
    secondary: Color(0xFF5D636B),
    brand: Color(0xFF111315),
    brandSoft: Color(0xFFECEEF1),
    onBrand: Color(0xFFFFFFFF),
    success: Color(0xFF0B7E55),
    successSoft: Color(0xFFE4F3EA),
    warning: Color(0xFF94560A),
    warningSoft: Color(0xFFFFF2D9),
    danger: Color(0xFFBE312B),
    dangerSoft: Color(0xFFFCEBEA),
    info: Color(0xFF2B3036),
    infoSoft: Color(0xFFECEEF1),
    elevated: Color(0xFFFFFFFF),
    dock: Color(0xFF111315),
    onDock: Color(0xFFB1BCCD),
    vault: Color(0xFF181B20),
  );
  static const dark = Palette(
    background: Color(0xFF111315),
    surface: Color(0xFF181B20),
    muted: Color(0xFF262A30),
    border: Color(0xFF3D4249),
    text: Color(0xFFECEEF1),
    secondary: Color(0xFFB1BCCD),
    brand: Color(0xFFF5F6F8),
    brandSoft: Color(0xFF2B3036),
    onBrand: Color(0xFF111315),
    success: Color(0xFF75D5A3),
    successSoft: Color(0xFF123323),
    warning: Color(0xFFEDB55A),
    warningSoft: Color(0xFF372A12),
    danger: Color(0xFFF08A82),
    dangerSoft: Color(0xFF3B1A19),
    info: Color(0xFFD0D5DD),
    infoSoft: Color(0xFF2B3036),
    elevated: Color(0xFF20242A),
    dock: Color(0xFF262A30),
    onDock: Color(0xFFB1BCCD),
    vault: Color(0xFF0B0D0F),
  );
  @override
  Palette copyWith() => this;
  @override
  Palette lerp(covariant Palette? other, double t) =>
      t < .5 ? this : other ?? this;
}

extension DesignContext on BuildContext {
  Palette get colors => Theme.of(this).extension<Palette>()!;
  bool get isDark => Theme.of(this).brightness == Brightness.dark;

  /// Archivo numerals for totals, dates and scores.
  TextStyle numeral(double size, {Color? color}) => TextStyle(
    fontFamily: 'Archivo',
    fontFamilyFallback: const ['Golos Text'],
    fontSize: size,
    height: 1.1,
    fontWeight: FontWeight.w700,
    color: color ?? colors.text,
    fontFeatures: const [FontFeature.tabularFigures()],
  );

  /// IBM Plex Mono for plates, VINs and document codes.
  TextStyle mono({double size = 14, Color? color}) => TextStyle(
    fontFamily: 'IBM Plex Mono',
    fontFamilyFallback: const ['Golos Text'],
    fontSize: size,
    height: 1.4,
    color: color ?? colors.text,
  );
}

ThemeData garageTheme(Brightness brightness) {
  final p = brightness == Brightness.dark ? Palette.dark : Palette.light;
  TextStyle style(double size, double height, FontWeight weight) => TextStyle(
    fontFamily: 'Plus Jakarta Sans',
    fontFamilyFallback: const ['Golos Text'],
    fontSize: size,
    height: height / size,
    fontWeight: weight,
    color: p.text,
    fontFeatures: const [FontFeature.tabularFigures()],
  );
  final texts = TextTheme(
    displaySmall: style(
      30,
      36,
      FontWeight.w600,
    ).copyWith(fontFamily: 'Archivo'),
    headlineSmall: style(
      24,
      30,
      FontWeight.w600,
    ).copyWith(fontFamily: 'Archivo'),
    titleLarge: style(22, 28, FontWeight.w600).copyWith(fontFamily: 'Archivo'),
    titleMedium: style(
      18,
      24,
      FontWeight.w600,
    ).copyWith(fontFamily: 'Plus Jakarta Sans'),
    bodyLarge: style(16, 24, FontWeight.w400),
    bodyMedium: style(14, 20, FontWeight.w400),
    bodySmall: style(12, 16, FontWeight.w500),
    labelLarge: style(16, 24, FontWeight.w600),
    labelMedium: style(14, 20, FontWeight.w500),
    labelSmall: style(12, 16, FontWeight.w500),
  );
  final scheme =
      ColorScheme.fromSeed(seedColor: p.brand, brightness: brightness).copyWith(
        primary: p.brand,
        onPrimary: p.onBrand,
        primaryContainer: p.brandSoft,
        onPrimaryContainer: p.brand,
        surface: p.surface,
        onSurface: p.text,
        onSurfaceVariant: p.secondary,
        outline: p.border,
        error: p.danger,
        errorContainer: p.dangerSoft,
        onErrorContainer: p.danger,
        surfaceContainerHighest: p.muted,
        secondaryContainer: p.brandSoft,
        onSecondaryContainer: p.brand,
      );
  final shape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(Radii.control),
  );
  final button = ButtonStyle(
    minimumSize: const WidgetStatePropertyAll(Size(48, Space.buttonHeight)),
    padding: const WidgetStatePropertyAll(
      EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    ),
    shape: WidgetStatePropertyAll(shape),
    textStyle: WidgetStatePropertyAll(texts.labelLarge),
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    extensions: [p],
    fontFamily: 'Plus Jakarta Sans',
    fontFamilyFallback: const ['Golos Text'],
    textTheme: texts,
    scaffoldBackgroundColor: p.background,
    visualDensity: VisualDensity.standard,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    appBarTheme: AppBarTheme(
      backgroundColor: p.surface,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: texts.titleMedium,
      centerTitle: false,
      toolbarHeight: 64,
      elevation: 0,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          bottom: Radius.circular(Radii.dock),
        ),
      ),
    ),
    cardTheme: CardThemeData(
      color: p.surface,
      elevation: 0,
      shadowColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.card),
        side: BorderSide(color: p.border),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(style: button),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: button.copyWith(
        foregroundColor: WidgetStateProperty.resolveWith(
          (states) =>
              states.contains(WidgetState.disabled) ? p.secondary : p.brand,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: button.copyWith(
        foregroundColor: WidgetStateProperty.resolveWith(
          (states) =>
              states.contains(WidgetState.disabled) ? p.secondary : p.brand,
        ),
      ),
    ),
    iconButtonTheme: const IconButtonThemeData(
      style: ButtonStyle(minimumSize: WidgetStatePropertyAll(Size(48, 48))),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.muted,
      contentPadding: const EdgeInsets.all(16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.control),
        borderSide: BorderSide(color: p.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.control),
        borderSide: BorderSide(color: p.brand, width: 2),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.control),
        borderSide: BorderSide(color: p.border),
      ),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: p.surface,
      indicatorColor: p.brandSoft,
      selectedIconTheme: IconThemeData(color: p.brand),
      selectedLabelTextStyle: texts.bodySmall?.copyWith(color: p.brand),
      unselectedIconTheme: IconThemeData(color: p.secondary),
      unselectedLabelTextStyle: texts.bodySmall?.copyWith(color: p.secondary),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: p.surface,
      indicatorColor: p.brandSoft,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => texts.bodySmall?.copyWith(
          color: states.contains(WidgetState.selected) ? p.brand : p.secondary,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected) ? p.brand : p.secondary,
        ),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: p.surface,
      selectedColor: p.brandSoft,
      side: BorderSide(color: p.border),
      labelStyle: texts.bodyMedium,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.control),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: p.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.card),
      ),
    ),
    popupMenuTheme: PopupMenuThemeData(color: p.surface),
    dividerTheme: DividerThemeData(color: p.border, space: Space.group),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: p.text,
      contentTextStyle: texts.bodyMedium?.copyWith(color: p.surface),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.control),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: p.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: p.border,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.card)),
      ),
    ),
  );
}
