import 'package:flutter/material.dart';

abstract final class Space {
  static const xs = 4.0,
      sm = 8.0,
      md = 12.0,
      page = 20.0,
      group = 24.0,
      section = 32.0;
  static const contentWidth = 960.0, tablet = 720.0, buttonHeight = 56.0;
}

abstract final class Radii {
  static const card = 16.0, control = 8.0, plate = 4.0;
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
      infoSoft;
  static const action = Color(0xFFC2410C), onAction = Color(0xFFFFFFFF);
  static const light = Palette(
    background: Color(0xFFF7F9FC),
    surface: Color(0xFFFFFFFF),
    muted: Color(0xFFF2F4F7),
    border: Color(0xFFE4E7EC),
    text: Color(0xFF1D2939),
    secondary: Color(0xFF667085),
    brand: Color(0xFFC2410C),
    brandSoft: Color(0xFFFFF3EB),
    onBrand: Color(0xFFFFFFFF),
    success: Color(0xFF157347),
    successSoft: Color(0xFFE4F3EA),
    warning: Color(0xFF94560A),
    warningSoft: Color(0xFFFFF2D9),
    danger: Color(0xFFBE312B),
    dangerSoft: Color(0xFFFCEBEA),
    info: Color(0xFF1D5FC0),
    infoSoft: Color(0xFFE7EFFB),
  );
  static const dark = Palette(
    background: Color(0xFF101828),
    surface: Color(0xFF182230),
    muted: Color(0xFF223044),
    border: Color(0xFF344054),
    text: Color(0xFFF2F4F7),
    secondary: Color(0xFFB1BCCD),
    brand: Color(0xFFFDBA74),
    brandSoft: Color(0xFF34271F),
    onBrand: Color(0xFF1A120D),
    success: Color(0xFF75D5A3),
    successSoft: Color(0xFF123323),
    warning: Color(0xFFEDB55A),
    warningSoft: Color(0xFF372A12),
    danger: Color(0xFFF08A82),
    dangerSoft: Color(0xFF3B1A19),
    info: Color(0xFF7AAAF2),
    infoSoft: Color(0xFF172A44),
  );
  @override
  Palette copyWith() => this;
  @override
  Palette lerp(covariant Palette? other, double t) =>
      t < .5 ? this : other ?? this;
}

extension DesignContext on BuildContext {
  Palette get colors => Theme.of(this).extension<Palette>()!;
}

ThemeData garageTheme(Brightness brightness) {
  final p = brightness == Brightness.dark ? Palette.dark : Palette.light;
  TextStyle style(double size, double height, FontWeight weight) => TextStyle(
    fontFamily: 'DM Sans',
    fontFamilyFallback: const ['Golos Text'],
    fontSize: size,
    height: height / size,
    fontWeight: weight,
    color: p.text,
    fontFeatures: const [FontFeature.tabularFigures()],
  );
  final texts = TextTheme(
    displaySmall: style(
      28,
      34,
      FontWeight.w600,
    ).copyWith(fontFamily: 'Plus Jakarta Sans'),
    titleLarge: style(
      22,
      28,
      FontWeight.w600,
    ).copyWith(fontFamily: 'Plus Jakarta Sans'),
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
        primary: Palette.action,
        onPrimary: Palette.onAction,
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
    fontFamily: 'DM Sans',
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
    ),
    cardTheme: CardThemeData(
      color: p.surface,
      elevation: 0,
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
      fillColor: p.surface,
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
    dialogTheme: DialogThemeData(backgroundColor: p.surface),
    popupMenuTheme: PopupMenuThemeData(color: p.surface),
    dividerTheme: DividerThemeData(color: p.border, space: Space.group),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: p.text,
      contentTextStyle: texts.bodyMedium?.copyWith(color: p.surface),
    ),
  );
}
