import 'package:flutter/material.dart';
import '../../features/roadside/device_location.dart';

import '../../design/foreground_polling.dart';

import '../../data/api_client.dart';
import '../../data/customer_portal.dart';
import '../../domain/portal.dart';
import '../../design/map_card.dart';
import '../../design/theme.dart';
import '../../design/widgets.dart';
import '../../l10n/l10n.dart';
import 'messages.dart';

/// Approximate pin used until device location is connected.
const garageArea = GeoPoint(
  41.2753,
  69.2034,
  address: 'Bunyodkor shoh koʻchasi, Chilonzor',
);

String roadsideStageLabel(BuildContext context, RoadsideStage stage) =>
    switch (stage) {
      RoadsideStage.created => context.l10n.stageNew,
      RoadsideStage.acknowledged => context.l10n.stageAcknowledged,
      RoadsideStage.assigned => context.l10n.stageAssigned,
      RoadsideStage.onTheWay => context.l10n.stageOnTheWay,
      RoadsideStage.inProgress => context.l10n.stageInProgress,
      RoadsideStage.resolved => context.l10n.stageResolved,
    };

IconData roadsideStageIcon(RoadsideStage stage) => switch (stage) {
  RoadsideStage.created => Icons.send_outlined,
  RoadsideStage.acknowledged => Icons.mark_email_read_outlined,
  RoadsideStage.assigned => Icons.engineering_outlined,
  RoadsideStage.onTheWay => Icons.local_shipping_outlined,
  RoadsideStage.inProgress => Icons.build_outlined,
  RoadsideStage.resolved => Icons.check_circle_outline,
};

String problemLabel(BuildContext context, RoadsideProblem problem) =>
    switch (problem) {
      RoadsideProblem.wontStart => context.l10n.problemWontStart,
      RoadsideProblem.flatTyre => context.l10n.problemFlatTyre,
      RoadsideProblem.accident => context.l10n.problemAccident,
      RoadsideProblem.other => context.l10n.problemOther,
    };

IconData problemIcon(RoadsideProblem problem) => switch (problem) {
  RoadsideProblem.wontStart => Icons.battery_alert_outlined,
  RoadsideProblem.flatTyre => Icons.tire_repair_outlined,
  RoadsideProblem.accident => Icons.car_crash_outlined,
  RoadsideProblem.other => Icons.help_outline,
};

class RoadsideScreen extends StatefulWidget {
  const RoadsideScreen({super.key, required this.portal, this.active,
    this.locationSource = const DeviceLocationSource()});
  final CustomerPortal portal;
  final RoadsideCase? active;
  final LocationSource locationSource;
  @override
  State<RoadsideScreen> createState() => _RoadsideScreenState();
}

class _RoadsideScreenState extends State<RoadsideScreen>
    with ForegroundPolling {
  late RoadsideCase? active = widget.active;
  List<PortalVehicle>? cars;
  CustomerProfile? profile;
  String? vehicleId;
  RoadsideProblem? problem;
  bool shareLocation = true, busy = false;
  int step = 1;
  Object? error;
  GeoPoint? location;

  Future<void> previewLocation() async {
    setState(() { busy = true; error = null; });
    try {
      final point = widget.portal.isDemo ? garageArea : await widget.locationSource.current();
      if (mounted) setState(() { location = point; step = 2; });
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally { if (mounted) setState(() => busy = false); }
  }
  @override
  bool get pollingEnabled => !widget.portal.isDemo;
  @override
  Future<void> poll() async {
    if (active != null && !busy) await track(silent: true);
  }

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() => error = null);
    try {
      final values = await Future.wait<Object>([
        widget.portal.cars(),
        widget.portal.profile(),
      ]);
      if (!mounted) return;
      setState(() {
        cars = values[0] as List<PortalVehicle>;
        profile = values[1] as CustomerProfile;
        if (cars!.length == 1) vehicleId = cars!.first.id;
      });
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  Future<void> request() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final point = location;
      if (point == null || !shareLocation) throw const AppFailure('Joylashuvga ruxsat bering.');
      final created = await widget.portal.requestRoadside(
        vehicleId: vehicleId!,
        problem: problem!,
        location: point,
      );
      if (mounted) setState(() => active = created);
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> track({bool silent = false}) async {
    try {
      final value = await widget.portal.roadside(active!.id);
      if (mounted) setState(() => active = value);
    } catch (e) {
      if (mounted && !silent) toast(context, context.message(failureText(e)));
    }
  }

  void callGarage() {
    final phone = profile?.garage.phone;
    if (phone != null) callNumber(context, phone);
  }

  @override
  Widget build(BuildContext context) {
    final current = active;
    return PageFrame(
      title: context.l10n.roadsideHelp,
      demo: widget.portal.isDemo,
      footerPadding: false,
      actions: [
        if (profile?.garage.phone != null)
          IconButton(
            tooltip: context.l10n.callGarage,
            onPressed: callGarage,
            icon: const Icon(Icons.call_outlined),
          ),
      ],
      body: current != null
          ? _Tracker(
              case_: current,
              onRefresh: track,
              onMessage: current.threadId == null
                  ? null
                  : () => openPage(
                      context,
                      CustomerChatScreen(
                        portal: widget.portal,
                        thread: current.threadId!,
                        title: widget.portal.garageName,
                      ),
                    ),
              onCall: profile?.garage.phone == null ? null : callGarage,
            )
          : cars == null && error == null
          ? const SkeletonPage(layout: SkeletonLayout.detail)
          : ListView(
              padding: const EdgeInsets.all(Space.page),
              children: [
                _EmergencyHeader(
                  onCall: profile?.garage.phone == null ? null : callGarage,
                ),
                const SizedBox(height: Space.grid),
                if (error != null) ...[
                  failureView(
                    context,
                    error!,
                    retry: cars == null ? load : null,
                    unavailableAction: profile?.garage.phone == null
                        ? null
                        : PillButton(
                            label: context.l10n.callGarage,
                            icon: Icons.call,
                            kind: PillKind.danger,
                            onPressed: callGarage,
                          ),
                  ),
                  const SizedBox(height: Space.grid),
                ],
                if (cars != null && step == 1) ...[
                  SectionTitle(context.l10n.whichCar),
                  Wrap(
                    spacing: Space.sm,
                    runSpacing: Space.sm,
                    children: [
                      for (final car in cars!)
                        ChoiceChip(
                          avatar: const Icon(Icons.directions_car_outlined),
                          label: Text(
                            '${car.label} · ${formatPlate(car.plate)}',
                          ),
                          selected: vehicleId == car.id,
                          materialTapTargetSize: MaterialTapTargetSize.padded,
                          onSelected: (_) => setState(() => vehicleId = car.id),
                        ),
                    ],
                  ),
                  SectionTitle(context.l10n.whatHappened),
                  BentoGrid(
                    square: false,
                    children: [
                      for (final value in RoadsideProblem.values)
                        BentoTile(
                          icon: problemIcon(value),
                          tone: problem == value ? 'danger' : null,
                          color: problem == value
                              ? context.colors.dangerSoft
                              : null,
                          label: '',
                          valueWidget: Text(
                            problemLabel(context, value),
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          onTap: () => setState(() => problem = value),
                        ),
                    ],
                  ),
                ],
                if (step == 2) ...[
                  SectionTitle(context.l10n.yourLocation),
                  MapPinCard(
                    latitude: location!.latitude,
                    longitude: location!.longitude,
                    address: location!.address,
                    semanticLabel: context.l10n.mapSemantics(
                      location!.address ?? '${location!.latitude.toStringAsFixed(4)}, ${location!.longitude.toStringAsFixed(4)}',
                    ),
                    footer: SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      value: shareLocation,
                      onChanged: (value) =>
                          setState(() => shareLocation = value),
                      title: Text(context.l10n.shareLocation),
                      subtitle: Text(context.l10n.approximateLocation),
                    ),
                  ),
                ],
              ],
            ),
      footer: current != null || cars == null
          ? null
          : SafeArea(
              minimum: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Row(
                children: [
                  if (step == 2) ...[
                    PillButton(
                      label: context.l10n.back,
                      kind: PillKind.secondary,
                      large: true,
                      onPressed: busy ? null : () => setState(() => step = 1),
                    ),
                    const SizedBox(width: Space.sm),
                  ],
                  Expanded(
                    child: PillButton(
                      label: step == 1
                          ? context.l10n.continueLabel
                          : context.l10n.requestHelp,
                      icon: step == 1
                          ? Icons.arrow_forward
                          : Icons.emergency_outlined,
                      kind: PillKind.danger,
                      large: true,
                      expand: true,
                      busy: busy,
                      onPressed: vehicleId == null || problem == null
                          ? null
                          : step == 1
                          ? previewLocation
                          : request,
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _EmergencyHeader extends StatelessWidget {
  const _EmergencyHeader({this.onCall});
  final VoidCallback? onCall;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(Space.card),
    decoration: BoxDecoration(
      color: context.colors.vault,
      borderRadius: BorderRadius.circular(Radii.card),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: Palette.sos,
                borderRadius: BorderRadius.circular(Radii.icon),
              ),
              child: const Icon(Icons.emergency_outlined, color: Colors.white),
            ),
            const SizedBox(width: Space.md),
            Expanded(
              child: Text(
                context.l10n.roadsideTitle,
                style: Theme.of(context).textTheme.titleLarge
                    ?.copyWith(color: const Color(0xFFECEEF1)),
              ),
            ),
          ],
        ),
        const SizedBox(height: Space.md),
        Text(
          context.l10n.roadsideHint,
          style: Theme.of(context).textTheme.bodyMedium
              ?.copyWith(color: const Color(0xFFB1BCCD)),
        ),
        if (onCall != null) ...[
          const SizedBox(height: Space.md),
          PillButton(
            label: context.l10n.callGarage,
            icon: Icons.call,
            kind: PillKind.secondary,
            onPressed: onCall,
          ),
        ],
      ],
    ),
  );
}

class _Tracker extends StatelessWidget {
  const _Tracker({
    required this.case_,
    required this.onRefresh,
    this.onMessage,
    this.onCall,
  });
  final RoadsideCase case_;
  final Future<void> Function() onRefresh;
  final VoidCallback? onMessage, onCall;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Space.page),
        children: [
          BentoCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: Space.sm,
                  runSpacing: Space.sm,
                  children: [
                    StatusBadge(
                      roadsideStageLabel(context, case_.stage),
                      tone: case_.open ? 'danger' : 'success',
                      icon: roadsideStageIcon(case_.stage),
                      large: true,
                    ),
                    StatusBadge(
                      problemLabel(context, case_.problem),
                      tone: 'neutral',
                      icon: problemIcon(case_.problem),
                    ),
                  ],
                ),
                const SizedBox(height: Space.md),
                Text(
                  case_.vehicle,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                if (case_.plate != null) ...[
                  const SizedBox(height: Space.xs),
                  Plate(case_.plate),
                ],
                if (case_.mechanic != null) ...[
                  const SizedBox(height: Space.md),
                  InfoLine(
                    icon: Icons.engineering_outlined,
                    text: case_.mechanic!,
                  ),
                ],
                if (case_.etaMinutes != null)
                  InfoLine(
                    icon: Icons.timer_outlined,
                    text: context.l10n.etaMinutes(case_.etaMinutes!),
                  ),
              ],
            ),
          ),
          const SizedBox(height: Space.grid),
          BentoCard(
            child: Column(
              children: [
                for (final stage in RoadsideStage.values)
                  _StageRow(
                    stage: stage,
                    reached: stage.index <= case_.stage.index,
                    current: stage == case_.stage,
                    last: stage == RoadsideStage.resolved,
                    detail:
                        stage == RoadsideStage.assigned &&
                            case_.mechanic != null
                        ? case_.mechanic
                        : null,
                  ),
              ],
            ),
          ),
          const SizedBox(height: Space.grid),
          MapPinCard(
            latitude: case_.location.latitude,
            longitude: case_.location.longitude,
            address: case_.location.address,
            semanticLabel: context.l10n.mapSemantics(
              case_.location.address ?? '',
            ),
          ),
          // Emergency actions take the full width, call first.
          if (onCall != null) ...[
            const SizedBox(height: Space.grid),
            PillButton(
              label: context.l10n.callGarage,
              icon: Icons.call,
              kind: PillKind.danger,
              large: true,
              expand: true,
              onPressed: onCall,
            ),
          ],
          if (onMessage != null) ...[
            const SizedBox(height: Space.sm),
            PillButton(
              label: context.l10n.message,
              icon: Icons.chat_bubble_outline,
              kind: PillKind.secondary,
              large: true,
              expand: true,
              onPressed: onMessage,
            ),
          ],
          const SizedBox(height: Space.sm),
          Center(
            child: TextButton.icon(
              onPressed: onRefresh,
              icon: const Icon(Icons.refresh),
              label: Text(context.l10n.refreshStatus),
            ),
          ),
          Text(
            context.l10n.requestedAt(context.clock(case_.created)),
            textAlign: TextAlign.center,
            style: context.mono(size: 12, color: p.secondary),
          ),
        ],
      ),
    );
  }
}

class _StageRow extends StatelessWidget {
  const _StageRow({
    required this.stage,
    required this.reached,
    required this.current,
    required this.last,
    this.detail,
  });
  final RoadsideStage stage;
  final bool reached, current, last;
  final String? detail;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final color = current
        ? p.danger
        : reached
        ? p.success
        : p.border;
    return Semantics(
      label:
          '${roadsideStageLabel(context, stage)}${current ? ', ${context.l10n.currentStep}' : ''}',
      excludeSemantics: true,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Column(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: reached ? color : p.surface,
                    shape: BoxShape.circle,
                    border: Border.all(color: color, width: 2),
                  ),
                  child: Icon(
                    roadsideStageIcon(stage),
                    size: 16,
                    color: reached ? Colors.white : p.secondary,
                  ),
                ),
                if (!last)
                  Expanded(
                    child: Container(
                      width: 2,
                      color: reached ? p.success : p.border,
                    ),
                  ),
              ],
            ),
            const SizedBox(width: Space.md),
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(top: 5, bottom: last ? 0 : Space.grid),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      roadsideStageLabel(context, stage),
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        color: reached ? p.text : p.secondary,
                        fontWeight: current ? FontWeight.w700 : null,
                      ),
                    ),
                    if (detail != null)
                      Text(detail!, style: TextStyle(color: p.secondary)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
