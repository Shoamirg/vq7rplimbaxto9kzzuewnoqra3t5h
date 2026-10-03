import 'package:flutter/material.dart';

import '../app_state.dart';
import '../data/repository.dart';
import '../design/theme.dart';
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
  Future<void> logout() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Hisobdan chiqish'),
        content: Text(
          widget.state.repository!.isDemo
              ? 'Demo oʻzgarishlari tiklanadi. Chiqasizmi?'
              : 'Hisobdan chiqasizmi?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Qolish'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Chiqish'),
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
      WorkList(repository: repo),
      CustomerList(repository: repo),
      BillList(repository: repo),
    ];
    final wide = MediaQuery.sizeOf(context).width >= Space.tablet;
    final content = Column(
      children: [
        if (repo.isDemo) const DemoNotice(),
        Expanded(child: pages[tab]),
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
              'GarageOS · ${widget.state.name}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Koʻrinishni almashtirish',
            onPressed: () =>
                widget.state.toggleTheme(Theme.of(context).brightness),
            icon: const Icon(Icons.brightness_6_outlined),
          ),
          IconButton(
            tooltip: 'Chiqish',
            onPressed: logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(
        child: wide
            ? Row(
                children: [
                  NavigationRail(
                    selectedIndex: tab,
                    onDestinationSelected: (i) => setState(() => tab = i),
                    labelType: NavigationRailLabelType.all,
                    destinations: const [
                      NavigationRailDestination(
                        icon: Icon(Icons.today_outlined),
                        label: Text('Navbat'),
                      ),
                      NavigationRailDestination(
                        icon: Icon(Icons.people_outline),
                        label: Text('Mijozlar'),
                      ),
                      NavigationRailDestination(
                        icon: Icon(Icons.receipt_long_outlined),
                        label: Text('Hisoblar'),
                      ),
                    ],
                  ),
                  const VerticalDivider(width: 1),
                  Expanded(child: content),
                ],
              )
            : content,
      ),
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: tab,
              onDestinationSelected: (i) => setState(() => tab = i),
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.today_outlined),
                  label: 'Navbat',
                ),
                NavigationDestination(
                  icon: Icon(Icons.people_outline),
                  label: 'Mijozlar',
                ),
                NavigationDestination(
                  icon: Icon(Icons.receipt_long_outlined),
                  label: 'Hisoblar',
                ),
              ],
            ),
    );
  }
}

class WorkList extends StatefulWidget {
  const WorkList({super.key, required this.repository});
  final GarageRepository repository;
  @override
  State<WorkList> createState() => _WorkListState();
}

class _WorkListState extends State<WorkList> {
  String query = '';
  int page = 1;
  bool today = true;
  final search = TextEditingController();
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  WorkStatus? status;
  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: Space.contentWidth),
      child: LoadView<PageData<Work>>(
        load: () => widget.repository.works(
          query: query,
          page: page,
          date: today ? DateTime.now() : null,
          status: status,
        ),
        builder: (data, reload) => ListView(
          padding: const EdgeInsets.all(Space.page),
          children: [
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
                      today ? 'Bugun' : 'Barcha navbatlar',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    Text(
                      today
                          ? dateLabel(DateTime.now())
                          : '${data.total} ta navbat',
                    ),
                  ],
                ),
                FilledButton.icon(
                  onPressed: () async {
                    await openPage(
                      context,
                      BookingScreen(repository: widget.repository),
                    );
                    if (mounted) reload();
                  },
                  icon: const Icon(Icons.add),
                  label: const Text('Yangi navbat'),
                ),
              ],
            ),
            const SizedBox(height: 24),
            TextField(
              controller: search,
              decoration: const InputDecoration(
                labelText: 'Navbat qidirish',
                hintText: 'Mijoz, mashina yoki usta…',
                prefixIcon: Icon(Icons.search),
              ),
              textInputAction: TextInputAction.search,
              onSubmitted: (s) => setState(() {
                query = s.trim();
                page = 1;
              }),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 56,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  FilterChip(
                    label: const Text('Faqat bugun'),
                    selected: today,
                    onSelected: (v) => setState(() {
                      today = v;
                      page = 1;
                    }),
                  ),
                  const SizedBox(width: 8),
                  for (final item in [
                    null,
                    WorkStatus.pending,
                    WorkStatus.confirmed,
                    WorkStatus.inProgress,
                    WorkStatus.completed,
                  ])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(item?.label ?? 'Barchasi'),
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
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: Text('${data.total} ta navbat topildi')),
                IconButton(
                  tooltip: 'Yangilash',
                  onPressed: reload,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            if (data.items.isEmpty)
              const EmptyNotice(
                'Navbat yoʻq',
                'Qidiruvni oʻzgartiring yoki yangi navbat yarating.',
              ),
            for (final work in data.items)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
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
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.all(16),
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
                StatusBadge(work.status.label, tone: workTone(work.status)),
              ],
            ),
            const SizedBox(height: 12),
            Text(work.car, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(work.customerName),
            const SizedBox(height: 8),
            Text(
              '${work.mechanic ?? 'Usta tayinlanmagan'} · ${work.duration} daqiqa',
              style: Theme.of(context).textTheme.bodyMedium
                  ?.copyWith(color: context.colors.secondary),
            ),
            if (dateKey(work.date) != dateKey(DateTime.now()))
              Text(dateLabel(work.date)),
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
  });
  final int page, total;
  final bool hasNext;
  final ValueChanged<int> onPage;
  @override
  Widget build(BuildContext context) => total <= 30
      ? const SizedBox.shrink()
      : Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            IconButton(
              tooltip: 'Oldingi sahifa',
              onPressed: page > 1 ? () => onPage(page - 1) : null,
              icon: const Icon(Icons.chevron_left),
            ),
            Text('$page / ${(total / 30).ceil()}'),
            IconButton(
              tooltip: 'Keyingi sahifa',
              onPressed: hasNext ? () => onPage(page + 1) : null,
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        );
}
