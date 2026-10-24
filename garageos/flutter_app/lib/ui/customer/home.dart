import 'package:flutter/material.dart';

import '../../data/customer_portal.dart';
import '../../domain/portal.dart';
import '../../design/theme.dart';
import '../../design/widgets.dart';
import '../../l10n/l10n.dart';
import '../customer_booking.dart';
import 'appointments.dart';
import 'billing.dart';
import 'cars.dart';
import 'roadside.dart';

class CustomerHomeTab extends StatelessWidget {
  const CustomerHomeTab({
    super.key,
    required this.portal,
    required this.onTab,
    required this.onUnread,
    this.refreshKey = 0,
  });
  final CustomerPortal portal;
  final ValueChanged<int> onTab;
  final ValueChanged<int> onUnread;
  final int refreshKey;

  @override
  Widget build(BuildContext context) => LoadView<HomeSummary>(
    loadKey: (portal, refreshKey),
    skeleton: SkeletonLayout.grid,
    load: () async {
      final summary = await portal.home();
      if (summary.unread != null) onUnread(summary.unread!);
      return summary;
    },
    builder: (home, reload) => RefreshIndicator(
      onRefresh: reload,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Space.page),
        children: [
          _Greeting(home: home, portal: portal, reload: reload),
          const SizedBox(height: Space.grid),
          if (home.roadside != null) ...[
            _RoadsideBanner(case_: home.roadside!, portal: portal, reload: reload),
            const SizedBox(height: Space.grid),
          ],
          if (home.next != null)
            AppointmentCard(
              appointment: home.next!,
              title: context.l10n.nextVisit,
              onTap: () => openPage(
                context,
                AppointmentsScreen(portal: portal),
              ),
            )
          else
            BentoCard(
              child: EmptyState(
                icon: Icons.event_available_outlined,
                title: context.l10n.noUpcomingVisit,
                action: PillButton(
                  label: context.l10n.bookService,
                  icon: Icons.add,
                  onPressed: () => _book(context, reload),
                ),
              ),
            ),
          if (home.estimate != null) ...[
            const SizedBox(height: Space.grid),
            _EstimateAlert(estimate: home.estimate!, portal: portal, reload: reload),
          ],
          const SizedBox(height: Space.grid),
          BentoGrid(
            children: [
              if (home.vehicle?.health != null)
                BentoTile(
                  label: context.l10n.carHealth,
                  valueWidget: Row(
                    children: [
                      HealthRing(
                        score: home.vehicle!.health!,
                        size: 64,
                        stroke: 7,
                        semanticLabel: context.l10n.healthSemantics(
                          home.vehicle!.health!,
                        ),
                      ),
                    ],
                  ),
                  footer: Text(
                    home.vehicle!.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelMedium,
                  ),
                  onTap: () => openPage(
                    context,
                    CarDetailScreen(portal: portal, vehicle: home.vehicle!),
                  ),
                )
              else
                BentoTile(
                  icon: Icons.directions_car_outlined,
                  label: context.l10n.myVehicles,
                  value: '→',
                  onTap: () => onTab(1),
                ),
              if (home.unread != null)
                BentoTile(
                  icon: Icons.chat_bubble_outline,
                  tone: home.unread! > 0 ? 'success' : null,
                  label: context.l10n.messages,
                  value: home.unread! > 0
                      ? context.l10n.newCount(home.unread!)
                      : '0',
                  onTap: () => onTab(3),
                ),
              BentoTile(
                icon: Icons.add_circle_outline,
                label: context.l10n.bookService,
                value: '+',
                onTap: () => _book(context, reload),
              ),
              BentoTile(
                icon: Icons.event_note_outlined,
                label: context.l10n.myAppointments,
                value: '→',
                onTap: () => openPage(
                  context,
                  AppointmentsScreen(portal: portal),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );

  Future<void> _book(BuildContext context, Reload reload) async {
    final sent = await openPage<bool>(
      context,
      CustomerBookingScreen(repository: portal),
    );
    if (sent == true && context.mounted) {
      toast(context, context.l10n.bookingWaitingConfirmation);
      await reload();
    }
  }
}

class _Greeting extends StatelessWidget {
  const _Greeting({
    required this.home,
    required this.portal,
    required this.reload,
  });
  final HomeSummary home;
  final CustomerPortal portal;
  final Reload reload;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              header: true,
              child: Text(
                context.l10n.helloName(home.firstName),
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            Text(
              home.garage,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: context.colors.secondary,
              ),
            ),
          ],
        ),
      ),
      const SizedBox(width: Space.md),
      Semantics(
        button: true,
        label: context.l10n.roadsideHelp,
        excludeSemantics: true,
        child: FilledButton.icon(
          style: FilledButton.styleFrom(
            backgroundColor: Palette.sos,
            foregroundColor: Colors.white,
            minimumSize: const Size(Touch.standard, 52),
            shape: const StadiumBorder(),
          ),
          onPressed: () async {
            await openPage(context, RoadsideScreen(portal: portal));
            await reload();
          },
          icon: const Icon(Icons.emergency_outlined),
          label: const Text('SOS'),
        ),
      ),
    ],
  );
}

class _EstimateAlert extends StatelessWidget {
  const _EstimateAlert({
    required this.estimate,
    required this.portal,
    required this.reload,
  });
  final Estimate estimate;
  final CustomerPortal portal;
  final Reload reload;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return BentoCard(
      borderColor: p.warning.withValues(alpha: .4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              MonoBadge(estimate.code, icon: Icons.request_quote_outlined),
              EstimateChip(estimate.status),
            ],
          ),
          const SizedBox(height: Space.md),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              context.money(estimate.total),
              style: context.numeral(30),
            ),
          ),
          Text(
            '${estimate.vehicle} · ${context.l10n.lineCount(estimate.lines.length)}',
            style: TextStyle(color: p.secondary),
          ),
          const SizedBox(height: Space.md),
          PillButton(
            label: context.l10n.openEstimate,
            icon: Icons.arrow_forward,
            expand: true,
            onPressed: () async {
              await openPage(
                context,
                EstimateScreen(portal: portal, id: estimate.id),
              );
              await reload();
            },
          ),
        ],
      ),
    );
  }
}

class _RoadsideBanner extends StatelessWidget {
  const _RoadsideBanner({
    required this.case_,
    required this.portal,
    required this.reload,
  });
  final RoadsideCase case_;
  final CustomerPortal portal;
  final Reload reload;
  @override
  Widget build(BuildContext context) => BentoCard(
    color: context.colors.dangerSoft,
    borderColor: Colors.transparent,
    onTap: () async {
      await openPage(context, RoadsideScreen(portal: portal, active: case_));
      await reload();
    },
    child: Row(
      children: [
        IconSquare(Icons.emergency_outlined, tone: 'danger'),
        const SizedBox(width: Space.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                context.l10n.roadsideHelp,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              Text(roadsideStageLabel(context, case_.stage)),
            ],
          ),
        ),
        const Icon(Icons.chevron_right),
      ],
    ),
  );
}

/// Bento date card for one appointment.
class AppointmentCard extends StatelessWidget {
  const AppointmentCard({
    super.key,
    required this.appointment,
    this.title,
    this.onTap,
  });
  final PortalAppointment appointment;
  final String? title;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => DateSlotCard(
    title: title,
    day: context.dayMonth(appointment.date),
    time: appointment.time,
    duration: context.l10n.minutes(appointment.minutes),
    chip: WorkStatusChip(appointment.status),
    onTap: onTap,
    footer: appointment.vehicle.isEmpty && appointment.service == null
        ? null
        : Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (appointment.vehicle.isNotEmpty)
                Text(
                  appointment.vehicle,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              if (appointment.plate != null) Plate(appointment.plate),
              if (appointment.service != null)
                StatusBadge(
                  appointment.service!,
                  icon: Icons.build_outlined,
                  tone: 'neutral',
                ),
            ],
          ),
  );
}
