import 'package:flutter/material.dart';

import '../data/repository.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../domain/models.dart';
import '../l10n/l10n.dart';
import 'booking.dart';
import 'work_detail.dart';

enum JobFilter { today, ongoing, awaitingInvoice, all }

/// Reception jobs home.
class WorkList extends StatefulWidget {
  const WorkList({super.key, required this.repository, this.refreshKey = 0});
  final GarageRepository repository;
  final int refreshKey;
  @override
  State<WorkList> createState() => _WorkListState();
}

class _WorkListState extends State<WorkList> {
  final search = TextEditingController();
  String query = '';
  JobFilter filter = JobFilter.today;
  WorkStatus? status;
  DateTime? date;
  int localRefresh = 0;

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  void updateSearch(String value) {
    if (query == value) return;
    setState(() => query = value);
  }

  void setFilter(JobFilter value) => setState(() {
    filter = value;
    status = null;
    if (value != JobFilter.all) date = null;
  });

  void resetFilters() {
    search.clear();
    setState(() {
      query = '';
      status = null;
      date = null;
      filter = JobFilter.all;
    });
  }

  Future<void> pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: date ?? now,
      firstDate: now.subtract(const Duration(days: 365)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null && mounted) {
      setState(() {
        date = picked;
        filter = JobFilter.all;
        status = null;
      });
    }
  }

  Future<PageData<Work>> load(int page) => widget.repository.works(
    query: query,
    page: page,
    date: filter == JobFilter.today ? DateTime.now() : date,
    status: switch (filter) {
      JobFilter.ongoing => WorkStatus.inProgress,
      JobFilter.awaitingInvoice => WorkStatus.completed,
      _ => status,
    },
    awaitingInvoice: filter == JobFilter.awaitingInvoice,
  );

  Future<void> create() async {
    await openPage(context, BookingScreen(repository: widget.repository));
    if (mounted) setState(() => localRefresh++);
  }

  @override
  Widget build(BuildContext context) {
    final repo = widget.repository;
    final filtered = query.isNotEmpty || status != null || date != null;
    return Stack(
      children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: Space.contentWidth),
            child: InfiniteList<Work>(
              storageKey: 'staff-work-list',
              filterKey: (query, filter, status, date),
              refreshKey: (repo, widget.refreshKey, localRefresh),
              load: load,
              bottomPadding: 96,
              header: (data, reload, loading) => [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Semantics(
                            header: true,
                            child: Text(
                              context.l10n.jobs,
                              style: Theme.of(context).textTheme.headlineSmall,
                            ),
                          ),
                          Text(
                            filter == JobFilter.today
                                ? context.date(DateTime.now())
                                : date != null
                                ? context.date(date!)
                                : context.l10n.receptionSubtitle,
                            style: TextStyle(color: context.colors.secondary),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: context.l10n.refresh,
                      onPressed: loading ? null : reload,
                      icon: const Icon(Icons.refresh),
                    ),
                  ],
                ),
                const SizedBox(height: Space.grid),
                PillSegments<JobFilter>(
                  semanticLabel: context.l10n.jobs,
                  values: JobFilter.values,
                  selected: filter,
                  label: (value) => switch (value) {
                    JobFilter.today => context.l10n.today,
                    JobFilter.ongoing => context.l10n.ongoingShort,
                    JobFilter.awaitingInvoice => context.l10n.awaitingInvoiceShort,
                    JobFilter.all => context.l10n.all,
                  },
                  onChanged: setFilter,
                ),
                const SizedBox(height: Space.md),
                Row(
                  children: [
                    Expanded(
                      child: ListSearchField(
                        controller: search,
                        label: context.l10n.searchAppointments,
                        hint: context.l10n.appointmentSearchHint,
                        onSearch: updateSearch,
                      ),
                    ),
                    const SizedBox(width: Space.sm),
                    IconButton.outlined(
                      tooltip: context.l10n.pickDate,
                      style: IconButton.styleFrom(
                        minimumSize: const Size(52, 52),
                        side: BorderSide(color: context.colors.border),
                        backgroundColor: date != null
                            ? context.colors.brand
                            : context.colors.elevated,
                        foregroundColor: date != null
                            ? context.colors.onBrand
                            : context.colors.text,
                      ),
                      onPressed: pickDate,
                      icon: const Icon(Icons.calendar_month_outlined),
                    ),
                  ],
                ),
                if (filter == JobFilter.today || filter == JobFilter.all) ...[
                  const SizedBox(height: Space.md),
                  SizedBox(
                    height: Touch.standard,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        for (final item in const [
                          WorkStatus.pending,
                          WorkStatus.confirmed,
                          WorkStatus.inProgress,
                          WorkStatus.completed,
                        ])
                          Padding(
                            padding: const EdgeInsets.only(right: Space.sm),
                            child: CountPill(
                              label: context.message(item.label),
                              icon: workIcon(item),
                              tone: workTone(item) == 'strong'
                                  ? null
                                  : workTone(item),
                              selected: status == item,
                              count: data == null
                                  ? 0
                                  : data.items
                                        .where((w) => w.status == item)
                                        .length,
                              onTap: () => setState(
                                () => status = status == item ? null : item,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: Space.md),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        loading && data == null
                            ? context.l10n.appointmentsLoading
                            : data == null
                            ? context.l10n.appointmentsFailed
                            : context.l10n.appointmentCount(data.total),
                        style: TextStyle(color: context.colors.secondary),
                      ),
                    ),
                    if (filtered || filter != JobFilter.all)
                      Flexible(
                        child: TextButton.icon(
                          onPressed: resetFilters,
                          icon: const Icon(Icons.filter_alt_off_outlined),
                          label: Text(
                            context.l10n.clearFilters,
                            maxLines: 2,
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: Space.sm),
              ],
              empty: (reload) => EmptyNotice(
                context.l10n.noAppointments,
                filtered
                    ? context.l10n.noMatchingAppointments
                    : filter == JobFilter.today
                    ? context.l10n.noAppointmentsToday
                    : context.l10n.newAppointmentHint,
                icon: Icons.event_available_outlined,
                action: filtered || filter == JobFilter.today
                    ? PillButton(
                        label: filtered
                            ? context.l10n.clearFilters
                            : context.l10n.viewAllAppointments,
                        icon: Icons.filter_alt_off_outlined,
                        kind: PillKind.secondary,
                        onPressed: resetFilters,
                      )
                    : null,
              ),
              item: (work, reload) => WorkTile(
                work: work,
                onTap: () async {
                  await openPage(
                    context,
                    WorkScreen(repository: repo, work: work),
                  );
                  await reload();
                },
              ),
            ),
          ),
        ),
        if (repo.canWrite)
          Positioned(
            right: Space.page,
            bottom: Space.page,
            child: FloatingActionButton.extended(
              heroTag: 'new-job',
              onPressed: create,
              backgroundColor: context.colors.brand,
              foregroundColor: context.colors.onBrand,
              shape: const StadiumBorder(),
              icon: const Icon(Icons.add),
              label: Text(context.l10n.newAppointment),
            ),
          ),
      ],
    );
  }
}

/// Job card: time, status, customer, car & plate, service and mechanic.
class WorkTile extends StatelessWidget {
  const WorkTile({
    super.key,
    required this.work,
    required this.onTap,
    this.showBilling = true,
  });
  final Work work;
  final VoidCallback onTap;
  final bool showBilling;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return BentoCard(
      padding: const EdgeInsets.all(Space.tile),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(work.time, style: context.numeral(24)),
              const SizedBox(width: Space.md),
              Expanded(
                child: Wrap(
                  spacing: Space.sm,
                  runSpacing: Space.sm,
                  alignment: WrapAlignment.end,
                  children: [
                    WorkStatusChip(work.status),
                    if (showBilling &&
                        work.status == WorkStatus.completed &&
                        work.awaitingInvoice == true)
                      StatusBadge(
                        context.l10n.awaitingInvoiceWork,
                        tone: 'warning',
                        icon: Icons.receipt_long_outlined,
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: Space.md),
          Text(work.customerName, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: Space.xs),
          Wrap(
            spacing: Space.sm,
            runSpacing: Space.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(work.car, style: TextStyle(color: p.secondary)),
              Plate(work.plate, size: 12),
            ],
          ),
          if (work.serviceLabel != null) ...[
            const SizedBox(height: Space.sm),
            InfoLine(icon: Icons.build_outlined, text: work.serviceLabel!),
          ],
          InfoLine(
            icon: Icons.engineering_outlined,
            text:
                '${work.mechanic ?? context.l10n.noMechanic} · ${context.l10n.minutes(work.duration)}',
          ),
          if (dateKey(work.date) != dateKey(DateTime.now()))
            InfoLine(icon: Icons.event_outlined, text: context.date(work.date)),
        ],
      ),
    );
  }
}
