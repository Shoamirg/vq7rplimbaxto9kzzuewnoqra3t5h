import 'package:flutter/material.dart';

import '../../data/customer_portal.dart';
import '../../domain/portal.dart';
import '../../design/qr.dart';
import '../../design/theme.dart';
import '../../design/vehicle_stage.dart';
import '../../design/widgets.dart';
import '../../l10n/l10n.dart';
import '../customer_booking.dart';
import 'messages.dart';

String healthAreaLabel(BuildContext context, HealthArea area) =>
    switch (area) {
      HealthArea.engine => context.l10n.areaEngine,
      HealthArea.brakes => context.l10n.areaBrakes,
      HealthArea.tires => context.l10n.areaTires,
      HealthArea.transmission => context.l10n.areaTransmission,
      HealthArea.general => context.l10n.areaGeneral,
    };

IconData healthAreaIcon(HealthArea area) => switch (area) {
  HealthArea.engine => Icons.oil_barrel_outlined,
  HealthArea.brakes => Icons.album_outlined,
  HealthArea.tires => Icons.tire_repair_outlined,
  HealthArea.transmission => Icons.settings_outlined,
  HealthArea.general => Icons.fact_check_outlined,
};

String healthStateLabel(BuildContext context, HealthState state) =>
    switch (state) {
      HealthState.onTrack => context.l10n.onTrack,
      HealthState.dueSoon => context.l10n.dueSoon,
      HealthState.overdue => context.l10n.overdue,
    };

IconData healthStateIcon(HealthState state) => switch (state) {
  HealthState.onTrack => Icons.check_circle_outline,
  HealthState.dueSoon => Icons.schedule,
  HealthState.overdue => Icons.error_outline,
};

class HealthChip extends StatelessWidget {
  const HealthChip(this.state, {super.key, this.label});
  final HealthState state;
  final String? label;
  @override
  Widget build(BuildContext context) => StatusBadge(
    label ?? healthStateLabel(context, state),
    tone: healthStateTone(state),
    icon: healthStateIcon(state),
  );
}

class CarsTab extends StatelessWidget {
  const CarsTab({super.key, required this.portal, this.refreshKey = 0});
  final CustomerPortal portal;
  final int refreshKey;
  @override
  Widget build(BuildContext context) => ListLoadView<List<PortalVehicle>>(
    storageKey: 'customer-cars',
    loadKey: (portal, refreshKey),
    filterKey: portal,
    load: portal.cars,
    header: (cars, reload, loading) => [
      Semantics(
        header: true,
        child: Text(
          context.l10n.myVehicles,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
      ),
      const SizedBox(height: Space.grid),
    ],
    items: (cars, reload) => [
      if (cars.isEmpty)
        EmptyState(
          icon: Icons.directions_car_outlined,
          title: context.l10n.noCarsYet,
          detail: context.l10n.noCarsHint,
          action: PillButton(
            label: context.l10n.messageGarage,
            icon: Icons.chat_bubble_outline,
            onPressed: () => openPage(context, MessagesScreen(portal: portal)),
          ),
        ),
      for (final car in cars)
        Padding(
          padding: const EdgeInsets.only(bottom: Space.grid),
          child: VehicleCard(
            vehicle: car,
            onTap: () => openPage(
              context,
              CarDetailScreen(portal: portal, vehicle: car),
            ),
          ),
        ),
    ],
  );
}

class VehicleCard extends StatelessWidget {
  const VehicleCard({super.key, required this.vehicle, this.onTap});
  final PortalVehicle vehicle;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return BentoCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const VehicleStage(),
          const SizedBox(height: Space.grid),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      vehicle.title,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: Space.sm),
                    Wrap(
                      spacing: Space.sm,
                      runSpacing: Space.sm,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Plate(vehicle.plate),
                        if (vehicle.km != null)
                          Text(
                            context.km(vehicle.km!),
                            style: context.mono(color: p.secondary),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              if (vehicle.health != null)
                HealthRing(
                  score: vehicle.health!,
                  size: 76,
                  stroke: 7,
                  semanticLabel: context.l10n.healthSemantics(vehicle.health!),
                ),
            ],
          ),
          if (vehicle.nextService != null) ...[
            const SizedBox(height: Space.md),
            HealthChip(
              vehicle.nextServiceState ?? HealthState.onTrack,
              label: context.l10n.nextServiceLabel(vehicle.nextService!),
            ),
          ],
        ],
      ),
    );
  }
}

class CarDetailScreen extends StatelessWidget {
  const CarDetailScreen({super.key, required this.portal, required this.vehicle});
  final CustomerPortal portal;
  final PortalVehicle vehicle;
  @override
  Widget build(BuildContext context) => PageFrame(
    title: vehicle.title,
    demo: portal.isDemo,
    body: LoadView<VehicleDetail>(
      loadKey: (portal, vehicle.id),
      load: () => portal.car(vehicle.id),
      builder: (detail, reload) {
        final car = detail.vehicle;
        final p = context.colors;
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(Space.page),
            children: [
              BentoCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (car.health != null) ...[
                          HealthRing(
                            score: car.health!,
                            size: 104,
                            semanticLabel: context.l10n.healthSemantics(
                              car.health!,
                            ),
                          ),
                          const SizedBox(width: Space.grid),
                        ],
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                context.l10n.overallHealth,
                                style: TextStyle(color: p.secondary),
                              ),
                              if (car.health != null)
                                HealthChip(healthStateOf(car.health!)),
                              if (car.km != null) ...[
                                const SizedBox(height: Space.sm),
                                FittedBox(
                                  fit: BoxFit.scaleDown,
                                  alignment: Alignment.centerLeft,
                                  child: Text(
                                    context.km(car.km!),
                                    style: context.numeral(20),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: Space.md),
                    Wrap(
                      spacing: Space.sm,
                      runSpacing: Space.sm,
                      children: [
                        Plate(car.plate),
                        if (car.vin != null) MonoBadge('VIN ${car.vin}', size: 12),
                      ],
                    ),
                  ],
                ),
              ),
              if (detail.categories.isEmpty) ...[
                SectionTitle(context.l10n.healthByArea),
                const BentoCard(child: UnavailableNotice()),
              ] else ...[
                SectionTitle(context.l10n.healthByArea),
                BentoGrid(
                  children: [
                    for (final area in detail.categories)
                      BentoTile(
                        icon: healthAreaIcon(area.area),
                        tone: healthStateTone(area.state),
                        label: healthAreaLabel(context, area.area),
                        value: '${area.score}',
                        footer: HealthChip(area.state),
                      ),
                  ],
                ),
              ],
              if (detail.due.isNotEmpty) ...[
                SectionTitle(context.l10n.dueServices),
                BentoCard(
                  padding: const EdgeInsets.symmetric(vertical: Space.sm),
                  child: Column(
                    children: [
                      for (final due in detail.due)
                        ListTile(
                          minTileHeight: 64,
                          leading: IconSquare(
                            healthStateIcon(due.state),
                            tone: healthStateTone(due.state),
                            size: 40,
                          ),
                          title: Text(due.title),
                          subtitle: Text(
                            due.dueKm != null
                                ? context.l10n.dueAtKm(context.km(due.dueKm!))
                                : due.dueDate != null
                                ? context.l10n.dueBy(context.date(due.dueDate!))
                                : '',
                          ),
                          trailing: HealthChip(due.state),
                        ),
                    ],
                  ),
                ),
              ],
              if (detail.visits.isNotEmpty) ...[
                SectionTitle(context.l10n.visitHistory),
                VisitTimeline(visits: detail.visits),
              ],
              const SizedBox(height: Space.group),
              PillButton(
                label: context.l10n.bookService,
                icon: Icons.event_available_outlined,
                expand: true,
                onPressed: () async {
                  final sent = await openPage<bool>(
                    context,
                    CustomerBookingScreen(
                      repository: portal,
                      vehicleId: car.id,
                    ),
                  );
                  if (sent == true && context.mounted) {
                    toast(context, context.l10n.bookingWaitingConfirmation);
                  }
                },
              ),
              const SizedBox(height: Space.md),
              PillButton(
                label: context.l10n.sharePassport,
                icon: Icons.verified_outlined,
                kind: PillKind.secondary,
                expand: true,
                onPressed: () => openPage(
                  context,
                  PassportScreen(portal: portal, vehicle: car),
                ),
              ),
            ],
          ),
        );
      },
    ),
  );
}

/// Chronological visits with a rail.
class VisitTimeline extends StatelessWidget {
  const VisitTimeline({super.key, required this.visits, this.blueprint = false});
  final List<ServiceVisit> visits;
  final bool blueprint;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return BentoCard(
      child: Column(
        children: [
          for (var i = 0; i < visits.length; i++)
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(
                    width: 20,
                    child: Column(
                      children: [
                        Container(
                          width: 12,
                          height: 12,
                          margin: const EdgeInsets.only(top: 4),
                          decoration: BoxDecoration(
                            color: i == 0 ? p.brand : p.surface,
                            shape: BoxShape.circle,
                            border: Border.all(color: p.brand, width: 2),
                          ),
                        ),
                        if (i < visits.length - 1)
                          Expanded(child: Container(width: 2, color: p.border)),
                      ],
                    ),
                  ),
                  const SizedBox(width: Space.md),
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(
                        bottom: i < visits.length - 1 ? Space.grid : 0,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            context.date(visits[i].date),
                            style: context.mono(size: 12, color: p.secondary),
                          ),
                          Text(
                            visits[i].title,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          Text(
                            [
                              if (visits[i].km != null) context.km(visits[i].km!),
                              if (visits[i].garage != null) visits[i].garage!,
                              if (visits[i].total != null && !blueprint)
                                context.money(visits[i].total!),
                            ].join(' · '),
                            style: TextStyle(color: p.secondary),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Telemetry-blueprint passport: identity, verified seal, log and QR.
class PassportScreen extends StatelessWidget {
  const PassportScreen({super.key, required this.portal, required this.vehicle});
  final CustomerPortal portal;
  final PortalVehicle vehicle;
  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.servicePassport,
    demo: portal.isDemo,
    body: LoadView<ServicePassport>(
      loadKey: (portal, vehicle.id),
      load: () => portal.passport(vehicle.id),
      builder: (passport, reload) {
        final p = context.colors;
        final car = passport.vehicle;
        return ListView(
          padding: const EdgeInsets.all(Space.page),
          children: [
            BentoCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: Space.sm,
                    runSpacing: Space.sm,
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        'GARAGEOS · ${context.l10n.servicePassport.toUpperCase()}',
                        style: context.mono(size: 11, color: p.secondary),
                      ),
                      if (passport.verified)
                        StatusBadge(
                          context.l10n.verified,
                          tone: 'success',
                          icon: Icons.verified,
                        ),
                    ],
                  ),
                  const SizedBox(height: Space.md),
                  const VehicleStage(blueprint: true),
                  const SizedBox(height: Space.md),
                  Text(car.title, style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: Space.sm),
                  Wrap(
                    spacing: Space.sm,
                    runSpacing: Space.sm,
                    children: [
                      Plate(car.plate),
                      if (car.vin != null)
                        MonoBadge(
                          'VIN ${car.vin}',
                          semanticLabel: 'VIN ${car.vin}',
                        ),
                    ],
                  ),
                  const SizedBox(height: Space.md),
                  InfoLine(
                    icon: Icons.home_repair_service_outlined,
                    text: passport.garage,
                  ),
                  if (car.km != null)
                    InfoLine(
                      icon: Icons.speed_outlined,
                      text: context.km(car.km!),
                      mono: true,
                    ),
                  InfoLine(
                    icon: Icons.event_outlined,
                    text: context.l10n.issuedOn(context.date(passport.issued)),
                  ),
                  const Divider(),
                  Row(
                    children: [
                      QrSeal(
                        data: passport.link,
                        size: 96,
                        semanticLabel: context.l10n.passportQr,
                      ),
                      const SizedBox(width: Space.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              context.l10n.passportQr,
                              style: Theme.of(context).textTheme.titleSmall,
                            ),
                            const SizedBox(height: Space.xs),
                            Text(
                              passport.link.replaceFirst('https://', ''),
                              style: context.mono(size: 12, color: p.secondary),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            SectionTitle(context.l10n.serviceLog),
            if (passport.visits.isEmpty)
              EmptyState(
                icon: Icons.history,
                title: context.l10n.noVisitsYet,
              )
            else
              VisitTimeline(visits: passport.visits, blueprint: true),
            const SizedBox(height: Space.group),
            PillButton(
              label: context.l10n.shareLink,
              icon: Icons.link,
              expand: true,
              onPressed: () =>
                  copyText(context, passport.link, context.l10n.linkCopied),
            ),
          ],
        );
      },
    ),
  );
}
