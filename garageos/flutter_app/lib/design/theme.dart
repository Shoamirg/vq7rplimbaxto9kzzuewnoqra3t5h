import 'package:flutter/material.dart';

// GarageOS visual language, shared with the public website (garageos.uz):
// alabaster canvas, white floating cards with a hairline white edge and a soft
// shadow, heavy tight Archivo display type, obsidian primary pills, emerald
// accents, and frosted "glass" islands for navigation.

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
      dock = 28.0,
      icon = 14.0,
      control = 9999.0,
      plate = 9999.0;
}

/// The website's two shadows: a barely-there lift for cards and a deeper one
/// for floating islands (dock, sticky bars, menus).
abstract final class Shadows {
  static const card = [
    BoxShadow(
      color: Color(0x0A111315),
      blurRadius: 24,
      spreadRadius: -4,
      offset: Offset(0, 8),
    ),
    BoxShadow(
      color: Color(0x05111315),
      blurRadius: 6,
      spreadRadius: -1,
      offset: Offset(0, 2),
    ),
  ];
  static const float = [
    BoxShadow(
      color: Color(0x24111315),
      blurRadius: 36,
      spreadRadius: -8,
      offset: Offset(0, 16),
    ),
  ];
  static const none = <BoxShadow>[];
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
    required this.hairline,
    required this.glass,
    required this.accent,
    required this.accentInk,
    required this.accentSoft,
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

  /// Card edge: a soft white line on light, a quiet border on dark.
  final Color hairline;

  /// Frosted navigation islands (dock, segment tracks).
  final Color glass;

  /// Emerald accent (dots, gauges, focus rings), its text-safe ink and a tint.
  final Color accent, accentInk, accentSoft;

  static const action = Color(0xFF111315), onAction = Color(0xFFFFFFFF);

  /// White-text emerald for money and send actions (AA on white text).
  static const emerald = Color(0xFF0B7E55);
  static const sos = Color(0xFFBE312B);

  /// Uzbek plate flag strip (same blue as the website plate).
  static const plateBlue = Color(0xFF0B6FB3);

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
    hairline: Color(0xB3FFFFFF),
    glass: Color(0xD1F5F7F9),
    accent: Color(0xFF109868),
    accentInk: Color(0xFF096645),
    accentSoft: Color(0x24109868),
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
    hairline: Color(0xFF30353C),
    glass: Color(0xD920242A),
    accent: Color(0xFF75D5A3),
    accentInk: Color(0xFF75D5A3),
    accentSoft: Color(0x2975D5A3),
  );
  @override
  Palette copyWith() => this;
  @override
  Palette lerp(covariant Palette? other, double t) =>
      t < .5 ? this : other ?? this;
}

/// Font families for a locale. Archivo and Plus Jakarta Sans have no Cyrillic,
/// so Russian switches the whole family to Inter Tight / Inter — exactly as the
/// website does — instead of mixing fonts glyph by glyph.
class TypeFamilies {
  const TypeFamilies._(this.display, this.body);
  final String display, body;
  static const latin = TypeFamilies._('Archivo', 'Plus Jakarta Sans');
  static const cyrillic = TypeFamilies._('Inter Tight', 'Inter');
  static TypeFamilies of(Locale? locale) =>
      locale?.languageCode == 'ru' ? cyrillic : latin;

  /// Per-glyph fallback: Inter carries the Uzbek ʻ (U+02BB) and Cyrillic.
  static const displayFallback = ['Inter Tight', 'Inter'];
  static const bodyFallback = ['Inter'];
}

extension DesignContext on BuildContext {
  Palette get colors => Theme.of(this).extension<Palette>()!;
  bool get isDark => Theme.of(this).brightness == Brightness.dark;

  /// Heavy, tightly tracked display numerals for totals, dates and scores.
  TextStyle numeral(double size, {Color? color}) => TextStyle(
    fontFamily:
        Theme.of(this).textTheme.displaySmall?.fontFamily ?? 'Archivo',
    fontFamilyFallback: TypeFamilies.displayFallback,
    fontSize: size,
    height: 1.05,
    fontWeight: FontWeight.w800,
    letterSpacing: -size * .03,
    color: color ?? colors.text,
    fontFeatures: const [FontFeature.tabularFigures()],
  );

  /// IBM Plex Mono for plates, VINs and document codes.
  TextStyle mono({double size = 14, Color? color}) => TextStyle(
    fontFamily: 'IBM Plex Mono',
    fontFamilyFallback: TypeFamilies.bodyFallback,
    fontSize: size,
    height: 1.4,
    color: color ?? colors.text,
  );

  /// Small uppercase emerald label above a heading (the website "kicker").
  TextStyle kicker() => mono(size: 11, color: colors.accentInk).copyWith(
    fontWeight: FontWeight.w600,
    letterSpacing: .9,
  );
}

ThemeData garageTheme(Brightness brightness, {Locale? locale}) {
  final p = brightness == Brightness.dark ? Palette.dark : Palette.light;
  final families = TypeFamilies.of(locale);
  TextStyle body(double size, double height, FontWeight weight) => TextStyle(
    fontFamily: families.body,
    fontFamilyFallback: TypeFamilies.bodyFallback,
    fontSize: size,
    height: height / size,
    fontWeight: weight,
    color: p.text,
    fontFeatures: const [FontFeature.tabularFigures()],
  );
  // Website display type: weight 800, line-height ~1.05, tracking −0.035em.
  TextStyle display(double size, double height) => TextStyle(
    fontFamily: families.display,
    fontFamilyFallback: TypeFamilies.displayFallback,
    fontSize: size,
    height: height / size,
    fontWeight: FontWeight.w800,
    letterSpacing: -size * .035,
    color: p.text,
  );
  final texts = TextTheme(
    displaySmall: display(34, 36),
    headlineSmall: display(28, 30),
    titleLarge: display(22, 26),
    titleMedium: body(18, 24, FontWeight.w700).copyWith(letterSpacing: -.2),
    bodyLarge: body(16, 24, FontWeight.w400),
    bodyMedium: body(14, 20, FontWeight.w400),
    bodySmall: body(12, 16, FontWeight.w500),
    labelLarge: body(16, 24, FontWeight.w600),
    labelMedium: body(14, 20, FontWeight.w500),
    labelSmall: body(12, 16, FontWeight.w500),
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
  final field = OutlineInputBorder(
    borderRadius: BorderRadius.circular(Radii.control),
    borderSide: BorderSide(color: p.border),
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    extensions: [p],
    fontFamily: families.body,
    fontFamilyFallback: TypeFamilies.bodyFallback,
    textTheme: texts,
    scaffoldBackgroundColor: p.background,
    visualDensity: VisualDensity.standard,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    appBarTheme: AppBarTheme(
      backgroundColor: p.background,
      surfaceTintColor: Colors.transparent,
      scrolledUnderElevation: 0,
      titleTextStyle: display(20, 24),
      centerTitle: false,
      toolbarHeight: 64,
      elevation: 0,
    ),
    cardTheme: CardThemeData(
      color: p.elevated,
      elevation: 0,
      shadowColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.card),
        side: BorderSide(color: p.hairline),
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
    // Fields sit on the canvas as white pills; focus is the emerald ring the
    // website uses for keyboard focus.
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.elevated,
      contentPadding: const EdgeInsets.all(16),
      border: field,
      enabledBorder: field.copyWith(borderSide: BorderSide(color: p.hairline)),
      focusedBorder: field.copyWith(
        borderSide: BorderSide(color: p.accent, width: 2),
      ),
      errorBorder: field.copyWith(borderSide: BorderSide(color: p.danger)),
      focusedErrorBorder: field.copyWith(
        borderSide: BorderSide(color: p.danger, width: 2),
      ),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: p.accent,
      linearTrackColor: p.muted,
      circularTrackColor: Colors.transparent,
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? Colors.white
            : p.secondary,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) =>
            states.contains(WidgetState.selected) ? Palette.emerald : p.muted,
      ),
      trackOutlineColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? Colors.transparent
            : p.border,
      ),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) =>
            states.contains(WidgetState.selected) ? Palette.emerald : null,
      ),
    ),
    radioTheme: RadioThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) =>
            states.contains(WidgetState.selected) ? Palette.emerald : null,
      ),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: p.surface,
      indicatorColor: p.brand,
      selectedIconTheme: IconThemeData(color: p.onBrand),
      selectedLabelTextStyle: texts.bodySmall?.copyWith(
        color: p.text,
        fontWeight: FontWeight.w700,
      ),
      unselectedIconTheme: IconThemeData(color: p.secondary),
      unselectedLabelTextStyle: texts.bodySmall?.copyWith(color: p.secondary),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: p.surface,
      indicatorColor: p.brand,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => texts.bodySmall?.copyWith(
          color: states.contains(WidgetState.selected) ? p.text : p.secondary,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected)
              ? p.onBrand
              : p.secondary,
        ),
      ),
    ),
    // Choices follow the website's slot picker: white with a hairline edge;
    // selected = emerald tint, emerald edge and emerald ink.
    chipTheme: ChipThemeData(
      backgroundColor: p.elevated,
      selectedColor: p.accentSoft,
      checkmarkColor: p.accentInk,
      side: WidgetStateBorderSide.resolveWith(
        (states) => BorderSide(
          color: states.contains(WidgetState.selected) ? p.accent : p.hairline,
        ),
      ),
      labelStyle: texts.bodyMedium,
      secondaryLabelStyle: texts.bodyMedium?.copyWith(
        color: p.accentInk,
        fontWeight: FontWeight.w600,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.control),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: p.elevated,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: display(22, 26),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.card),
      ),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: p.elevated,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.tile),
      ),
    ),
    dividerTheme: DividerThemeData(color: p.border, space: Space.group),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: p.text,
      contentTextStyle: texts.bodyMedium?.copyWith(color: p.background),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.control),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: p.elevated,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: p.border,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.card)),
      ),
    ),
  );
}
