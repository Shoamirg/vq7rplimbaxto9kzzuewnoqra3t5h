import 'package:flutter/material.dart';

import '../../data/customer_portal.dart';
import '../../domain/portal.dart';
import '../../design/theme.dart';
import '../../design/widgets.dart';
import '../../l10n/l10n.dart';
import '../customer_booking.dart';
import 'home.dart';

class AppointmentsScreen extends StatefulWidget {
  const AppointmentsScreen({super.key, required this.portal});
  final CustomerPortal portal;
  @override
  State<AppointmentsScreen> createState() => _AppointmentsScreenState();
}

class _AppointmentsScreenState extends State<AppointmentsScreen> {
  bool upcoming = true;
  int refresh = 0;

  Future<void> book() async {
    final sent = await openPage<bool>(
      context,
      CustomerBookingScreen(repository: widget.portal),
    );
    if (sent == true && mounted) {
      toast(context, context.l10n.bookingWaitingConfirmation);
      setState(() {
        upcoming = true;
        refresh++;
      });
    }
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.myAppointments,
    demo: widget.portal.isDemo,
    body: ListLoadView<List<PortalAppointment>>(
      storageKey: 'customer-appointments',
      loadKey: (widget.portal, refresh),
      filterKey: upcoming,
      load: widget.portal.appointments,
      header: (data, reload, loading) => [
        PillSegments<bool>(
          values: const [true, false],
          selected: upcoming,
          label: (value) =>
              value ? context.l10n.upcoming : context.l10n.past,
          counts: data == null
              ? null
              : (value) => data.where((a) => a.upcoming == value).length,
          onChanged: (value) => setState(() => upcoming = value),
        ),
        const SizedBox(height: Space.grid),
      ],
      items: (data, reload) {
        final rows = data.where((a) => a.upcoming == upcoming).toList()
          ..sort(
            (a, b) => upcoming
                ? '${a.date}${a.time}'.compareTo('${b.date}${b.time}')
                : '${b.date}${b.time}'.compareTo('${a.date}${a.time}'),
          );
        return [
          if (rows.isEmpty)
            EmptyState(
              icon: Icons.event_available_outlined,
              title: upcoming
                  ? context.l10n.noUpcomingVisit
                  : context.l10n.noPastVisits,
              action: upcoming
                  ? PillButton(
                      label: context.l10n.bookService,
                      icon: Icons.add,
                      onPressed: book,
                    )
                  : null,
            ),
          for (final appointment in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.grid),
              child: AppointmentCard(appointment: appointment),
            ),
        ];
      },
    ),
    footer: SaveButton(
      label: context.l10n.bookService,
      icon: Icons.add,
      onPressed: book,
    ),
  );
}
