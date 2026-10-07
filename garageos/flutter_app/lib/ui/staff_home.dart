import 'package:flutter/material.dart';

import '../app_state.dart';
import '../data/repository.dart';
import '../design/theme.dart';
import '../l10n/l10n.dart';
import 'settings.dart';
import '../design/widgets.dart';
import '../domain/models.dart';
import 'booking.dart';
import 'customers.dart';
import 'work_detail.dart';
import 'billing.dart';

class StaffHome extends StatefulWidget {
  const StaffHome({super.key, required this.state, required this.onLogout});
  final AppState state;
  final VoidCallback onLogout;
  @override
  State<StaffHome> createState() => _StaffHomeState();
}

class _StaffHomeState extends State<StaffHome> {
  int tab = 0;
  final visited = <int>{0};
  final refreshKeys = [0, 0, 0];

  void selectTab(int index) {
    if (index == tab) return;
    setState(() {
      visited.add(index);
      tab = index;
      refreshKeys[index]++;
    });
  }

  Future<void> logout() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.signOutTitle),
        content: Text(
          widget.state.repository!.isDemo
              ? context.l10n.demoSignOut
              : context.l10n.confirmSignOut,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(context.l10n.stay),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(context.l10n.signOut),
          ),
        ],
      ),
    );
    if (yes == true && mounted) widget.onLogout();
  }

  @override
  Widget build(BuildContext context) {
    final repo = widget.state.repository!;
    final pages = [
      WorkList(repository: repo, refreshKey: refreshKeys[0]),
      CustomerList(repository: repo, refreshKey: refreshKeys[1]),
      BillList(repository: repo, refreshKey: refreshKeys[2]),
    ];
    final wide = MediaQuery.sizeOf(context).width >= Space.tablet;
    final content = Column(
      children: [
        if (repo.isDemo) DemoNotice(),
        if (!repo.canWrite) const ReadOnlyNotice(),
        Expanded(
          child: IndexedStack(
            index: tab,
            children: [
              for (var i = 0; i < pages.length; i++)
                visited.contains(i) ? pages[i] : SizedBox.shrink(),
            ],
          ),
        ),
      ],
    );
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.state.garageName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            Text(
              'GarageOS · ${repo.isDemo ? context.l10n.demoStaff : widget.state.name}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
        actions: [
          const LanguageMenu(),
          IconButton(
            tooltip: context.l10n.toggleTheme,
            onPressed: () =>
                widget.state.toggleTheme(Theme.of(context).brightness),
            icon: Icon(Icons.brightness_6_outlined),
          ),
          IconButton(
            tooltip: context.l10n.signOut,
            onPressed: logout,
            icon: Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(
        child: repo.isMechanic
            ? WorkList(repository: repo)
            : wide
            ? Row(
                children: [
                  NavigationRail(
                    selectedIndex: tab,
                    onDestinationSelected: selectTab,
                    labelType: NavigationRailLabelType.all,
                    destinations: [
                      NavigationRailDestination(
                        icon: Icon(Icons.today_outlined),
                        label: Text(context.l10n.appointments),
                      ),
                      NavigationRailDestination(
                        icon: Icon(Icons.people_outline),
                        label: Text(context.l10n.customers),
                      ),
                      NavigationRailDestination(
                        icon: Icon(Icons.receipt_long_outlined),
                        label: Text(context.l10n.invoices),
                      ),
                    ],
                  ),
                  VerticalDivider(width: 1),
                  Expanded(child: content),
                ],
              )
            : content,
      ),
      bottomNavigationBar: wide || repo.isMechanic
          ? null
          : NavigationBar(
              selectedIndex: tab,
              onDestinationSelected: selectTab,
              destinations: [
                NavigationDestination(
                  icon: Icon(Icons.today_outlined),
                  label: context.l10n.appointments,
                ),
                NavigationDestination(
                  icon: Icon(Icons.people_outline),
                  label: context.l10n.customers,
                ),
                NavigationDestination(
                  icon: Icon(Icons.receipt_long_outlined),
                  label: context.l10n.invoices,
                ),
              ],
            ),
    );
  }
}

class WorkList extends StatefulWidget {
  const WorkList({super.key, required this.repository, this.refreshKey = 0});
  final GarageRepository repository;
  final int refreshKey;
  @override
  State<WorkList> createState() => _WorkListState();
}

class _WorkListState extends State<WorkList> {
  String query = '';
  int page = 1;
  bool today = true;
  @override
  void initState() {
    super.initState();
    if (widget.repository.isMechanic) today = false;
  }

  final search = TextEditingController();
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  WorkStatus? status;
  bool get ongoing => !today && status == WorkStatus.inProgress;

  void updateSearch(String value) {
    if (query == value) return;
    setState(() {
      query = value;
      page = 1;
    });
  }

  void resetFilters() {
    search.clear();
    setState(() {
      query = '';
      status = null;
      today = false;
      page = 1;
    });
  }

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: BoxConstraints(maxWidth: Space.contentWidth),
      child: ListLoadView<PageData<Work>>(
        storageKey: 'staff-work-list',
        filterKey: (query, page, today, status),
        loadKey: (
          widget.repository,
          query,
          page,
          today,
          status,
          widget.refreshKey,
        ),
        load: () => widget.repository.works(
          query: query,
          page: page,
          date: today ? DateTime.now() : null,
          status: status,
        ),
        header: (data, reload, loading) => [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 16,
            runSpacing: 12,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.repository.isMechanic
                        ? context.l10n.myWork
                        : ongoing
                        ? context.l10n.ongoingWork
                        : today
                        ? context.l10n.today
                        : context.l10n.allAppointments,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  Text(
                    widget.repository.isMechanic
                        ? context.l10n.assignedWorkHint
                        : ongoing
                        ? context.l10n.ongoingWorkHint
                        : today
                        ? context.date(DateTime.now())
                        : context.l10n.receptionSubtitle,
                  ),
                ],
              ),
              if (widget.repository.canWrite)
                FilledButton.icon(
                  onPressed: () async {
                    await openPage(
                      context,
                      BookingScreen(repository: widget.repository),
                    );
                    if (mounted) reload();
                  },
                  icon: Icon(Icons.add),
                  label: Text(context.l10n.newAppointment),
                ),
            ],
          ),
          SizedBox(height: 24),
          ListSearchField(
            controller: search,
            label: context.l10n.searchAppointments,
            hint: context.l10n.appointmentSearchHint,
            onSearch: updateSearch,
          ),
          SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: FilterChip(
              avatar: const Icon(Icons.build_outlined, size: 18),
              label: Text(context.l10n.ongoingWork),
              selected: ongoing,
              onSelected: (selected) => setState(() {
                today = false;
                status = selected ? WorkStatus.inProgress : null;
                page = 1;
              }),
            ),
          ),
          SizedBox(height: 12),
          if (!widget.repository.isMechanic)
            SegmentedButton<bool>(
              style: ButtonStyle(
                minimumSize: WidgetStatePropertyAll(Size(48, 48)),
              ),
              segments: [
                ButtonSegment(value: true, label: Text(context.l10n.today)),
                ButtonSegment(value: false, label: Text(context.l10n.allDates)),
              ],
              selected: {today},
              showSelectedIcon: false,
              onSelectionChanged: (values) => setState(() {
                today = values.single;
                page = 1;
              }),
            ),
          SizedBox(height: Space.xs),
          SizedBox(
            height: 56,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (final item in [
                  null,
                  WorkStatus.pending,
                  WorkStatus.confirmed,
                  WorkStatus.inProgress,
                  WorkStatus.completed,
                ])
                  Padding(
                    padding: EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(
                        item == null
                            ? context.l10n.all
                            : context.message(item.label),
                      ),
                      selected: status == item,
                      onSelected: (_) => setState(() {
                        status = item;
                        page = 1;
                      }),
                    ),
                  ),
              ],
            ),
          ),
          SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Text(
                  loading
                      ? context.l10n.appointmentsLoading
                      : data == null
                      ? context.l10n.appointmentsFailed
                      : context.l10n.appointmentCount(data.total),
                ),
              ),
              IconButton(
                tooltip: context.l10n.refresh,
                onPressed: loading ? null : reload,
                icon: Icon(Icons.refresh),
              ),
            ],
          ),
        ],
        items: (data, reload) => [
          if (data.items.isEmpty)
            EmptyNotice(
              widget.repository.isMechanic
                  ? context.l10n.noAssignedWork
                  : context.l10n.noAppointments,
              query.isNotEmpty || status != null
                  ? context.l10n.noMatchingAppointments
                  : widget.repository.isMechanic
                  ? context.l10n.assignedWorkHint
                  : today
                  ? context.l10n.noAppointmentsToday
                  : context.l10n.newAppointmentHint,
              action: query.isNotEmpty || status != null || today
                  ? OutlinedButton.icon(
                      onPressed: resetFilters,
                      icon: Icon(Icons.filter_alt_off_outlined),
                      label: Text(
                        query.isEmpty && status == null
                            ? context.l10n.viewAllAppointments
                            : context.l10n.clearFilters,
                      ),
                    )
                  : null,
            ),
          for (final work in data.items)
            Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: WorkTile(
                work: work,
                onTap: () async {
                  await openPage(
                    context,
                    WorkScreen(repository: widget.repository, work: work),
                  );
                  if (mounted) reload();
                },
              ),
            ),
          Pager(
            page: page,
            total: data.total,
            hasNext: data.hasNext,
            onPage: (p) => setState(() => page = p),
          ),
        ],
      ),
    ),
  );
}

class WorkTile extends StatelessWidget {
  const WorkTile({super.key, required this.work, required this.onTap});
  final Work work;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Card(
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(Radii.card),
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 12,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(work.time, style: Theme.of(context).textTheme.titleMedium),
                Plate(work.plate),
                StatusBadge(
                  context.message(work.status.label),
                  tone: workTone(work.status),
                  icon: switch (work.status) {
                    WorkStatus.pending => Icons.schedule,
                    WorkStatus.confirmed => Icons.event_available_outlined,
                    WorkStatus.inProgress => Icons.build_outlined,
                    WorkStatus.completed => Icons.check_circle_outline,
                    WorkStatus.cancelled => Icons.cancel_outlined,
                    WorkStatus.rescheduled => Icons.event_repeat,
                    WorkStatus.unknown => Icons.help_outline,
                  },
                ),
              ],
            ),
            SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    work.car,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                SizedBox(width: Space.sm),
                Icon(Icons.chevron_right, color: context.colors.secondary),
              ],
            ),
            SizedBox(height: 4),
            Text(work.customerName),
            SizedBox(height: 8),
            Row(
              children: [
                Icon(
                  Icons.person_outline,
                  size: 18,
                  color: context.colors.secondary,
                ),
                SizedBox(width: Space.xs),
                Expanded(
                  child: Text(
                    '${work.mechanic ?? context.l10n.noMechanic} · ${context.l10n.minutes(work.duration)}',
                    style: Theme.of(context).textTheme.bodyMedium
                        ?.copyWith(color: context.colors.secondary),
                  ),
                ),
              ],
            ),
            if (dateKey(work.date) != dateKey(DateTime.now()))
              Text(context.date(work.date)),
          ],
        ),
      ),
    ),
  );
}

class Pager extends StatelessWidget {
  const Pager({
    super.key,
    required this.page,
    required this.total,
    required this.hasNext,
    required this.onPage,
    this.size = 30,
  });
  final int page, total, size;
  final bool hasNext;
  final ValueChanged<int> onPage;
  @override
  Widget build(BuildContext context) => total <= size && page <= 1
      ? SizedBox.shrink()
      : Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            IconButton(
              tooltip: context.l10n.previousPage,
              onPressed: page > 1 ? () => onPage(page - 1) : null,
              icon: Icon(Icons.chevron_left),
            ),
            Text('$page / ${total == 0 ? 1 : (total / size).ceil()}'),
            IconButton(
              tooltip: context.l10n.nextPage,
              onPressed: hasNext ? () => onPage(page + 1) : null,
              icon: Icon(Icons.chevron_right),
            ),
          ],
        );
}
