import 'package:flutter/material.dart';

import '../../data/api_client.dart';
import '../../data/repository.dart';
import '../../design/theme.dart';
import '../../design/vehicle_stage.dart';
import '../../design/widgets.dart';
import '../../domain/models.dart';
import '../../l10n/l10n.dart';

/// Today's assigned cars as oversized, high-contrast cards.
class MechanicJobsTab extends StatefulWidget {
  const MechanicJobsTab({
    super.key,
    required this.repository,
    required this.name,
    this.refreshKey = 0,
  });
  final GarageRepository repository;
  final String name;
  final int refreshKey;
  @override
  State<MechanicJobsTab> createState() => _MechanicJobsTabState();
}

class _MechanicJobsTabState extends State<MechanicJobsTab> {
  bool today = true;
  int local = 0;
  @override
  Widget build(BuildContext context) => InfiniteList<Work>(
    storageKey: 'mechanic-jobs',
    filterKey: today,
    refreshKey: (widget.repository, widget.refreshKey, local),
    gap: Space.grid,
    load: (page) => widget.repository.works(
      page: page,
      date: today ? DateTime.now() : null,
    ),
    header: (data, reload, loading) => [
      Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    context.l10n.myWork,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ),
                Text(
                  today ? context.date(DateTime.now()) : widget.name,
                  style: TextStyle(color: context.colors.secondary),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: context.l10n.refresh,
            iconSize: 28,
            style: IconButton.styleFrom(minimumSize: const Size(64, 64)),
            onPressed: loading ? null : reload,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      const SizedBox(height: Space.md),
      SizedBox(
        height: Touch.mechanic,
        child: PillSegments<bool>(
          values: const [true, false],
          selected: today,
          label: (value) => value ? context.l10n.today : context.l10n.allDates,
          counts: (value) => value == today ? data?.total : null,
          onChanged: (value) => setState(() => today = value),
        ),
      ),
      const SizedBox(height: Space.grid),
    ],
    empty: (reload) => EmptyNotice(
      context.l10n.noAssignedWork,
      context.l10n.assignedWorkHint,
      icon: Icons.build_circle_outlined,
      action: today
          ? PillButton(
              label: context.l10n.allDates,
              kind: PillKind.secondary,
              large: true,
              onPressed: () => setState(() => today = false),
            )
          : null,
    ),
    item: (work, reload) => MechanicJobCard(
      work: work,
      onTap: () async {
        await openPage(
          context,
          MechanicJobScreen(repository: widget.repository, work: work),
        );
        await reload();
      },
    ),
  );
}

class MechanicJobCard extends StatelessWidget {
  const MechanicJobCard({super.key, required this.work, required this.onTap});
  final Work work;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    const fg = Color(0xFFF5F6F8), muted = Color(0xFFB1BCCD);
    return Semantics(
      button: true,
      label: [
        work.time,
        work.car,
        formatPlate(work.plate),
        ?work.serviceLabel,
        context.message(work.status.label),
      ].join(', '),
      excludeSemantics: true,
      child: Material(
        color: p.vault,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Radii.card),
          side: context.isDark ? BorderSide(color: p.border) : BorderSide.none,
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 180),
            child: Padding(
              padding: const EdgeInsets.all(Space.card),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: Space.md,
                    runSpacing: Space.sm,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(work.time, style: context.numeral(40, color: fg)),
                      WorkStatusChip(work.status, large: true),
                    ],
                  ),
                  const SizedBox(height: Space.md),
                  Text(
                    work.car,
                    style: Theme.of(
                      context,
                    ).textTheme.headlineSmall?.copyWith(color: fg),
                  ),
                  const SizedBox(height: Space.sm),
                  Plate(work.plate, inverse: true, size: 18),
                  if (work.serviceLabel != null) ...[
                    const SizedBox(height: Space.md),
                    Row(
                      children: [
                        const Icon(Icons.build_outlined, color: muted, size: 22),
                        const SizedBox(width: Space.sm),
                        Expanded(
                          child: Text(
                            work.serviceLabel!,
                            style: Theme.of(
                              context,
                            ).textTheme.titleMedium?.copyWith(color: fg),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Car identity, service and notes in large type, one 64px pill.
class MechanicJobScreen extends StatefulWidget {
  const MechanicJobScreen({
    super.key,
    required this.repository,
    required this.work,
  });
  final GarageRepository repository;
  final Work work;
  @override
  State<MechanicJobScreen> createState() => _MechanicJobScreenState();
}

class _MechanicJobScreenState extends State<MechanicJobScreen> {
  late Work work = widget.work;
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() => run(() async {
    final current = await widget.repository.work(work.id);
    if (mounted) setState(() => work = current);
  });

  Future<void> run(Future<void> Function() action) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> start() => run(() async {
    final result = await widget.repository.changeWork(work.id, 'start');
    if (mounted) setState(() => work = result);
  });

  Future<void> finish() async {
    final note = await textSheet(
      context,
      title: context.l10n.completeWork,
      message: context.l10n.completionNoteHint,
      label: context.l10n.completionNotes,
      confirmLabel: context.l10n.completeWork,
      large: true,
    );
    if (note == null || !mounted) return;
    final service = work.serviceLabel ?? context.l10n.generalService;
    await run(() async {
      final result = await widget.repository.changeWork(work.id, 'complete', {
        'service_type': service.length > 100 ? service.substring(0, 100) : service,
        'notes': note.isEmpty ? null : note,
      });
      if (!mounted) return;
      setState(() => work = result);
      toast(context, context.l10n.workCompleted);
    });
  }

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final action = widget.repository.primaryWorkAction(work, hasInvoice: false);
    final large = Theme.of(context).textTheme.titleLarge;
    return PageFrame(
      title: work.car,
      demo: widget.repository.isDemo,
      language: false,
      actions: [
        IconButton(
          tooltip: context.l10n.refresh,
          style: IconButton.styleFrom(minimumSize: const Size(64, 64)),
          onPressed: busy ? null : reload,
          icon: const Icon(Icons.refresh),
        ),
      ],
      body: ListView(
        padding: const EdgeInsets.all(Space.page),
        children: [
          if (busy) const LinearProgressIndicator(minHeight: 3),
          if (error != null) ...[
            const SizedBox(height: Space.md),
            ErrorNotice(error!, retry: reload),
          ],
          BentoCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const VehicleStage(blueprint: true),
                const SizedBox(height: Space.grid),
                Wrap(
                  spacing: Space.sm,
                  runSpacing: Space.sm,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Plate(work.plate, size: 20),
                    WorkStatusChip(work.status, large: true),
                  ],
                ),
                const SizedBox(height: Space.md),
                Text(work.car, style: Theme.of(context).textTheme.headlineSmall),
                Text(
                  '${work.time} · ${context.l10n.minutes(work.duration)}',
                  style: context.numeral(20, color: p.secondary),
                ),
              ],
            ),
          ),
          SectionTitle(context.l10n.serviceType),
          BentoCard(
            child: Row(
              children: [
                IconSquare(Icons.build_outlined, size: 56),
                const SizedBox(width: Space.md),
                Expanded(
                  child: Text(
                    work.serviceLabel ?? context.l10n.generalService,
                    style: large,
                  ),
                ),
              ],
            ),
          ),
          SectionTitle(context.l10n.customerConcern),
          BentoCard(
            child: Text(
              work.customerNotes?.trim().isNotEmpty == true
                  ? work.customerNotes!
                  : context.l10n.noNotes,
              style: large?.copyWith(fontWeight: FontWeight.w500, height: 1.4),
            ),
          ),
          if (work.notes?.trim().isNotEmpty == true) ...[
            SectionTitle(context.l10n.staffNotes),
            BentoCard(child: Text(work.notes!, style: large)),
          ],
          if (action == null && work.status != WorkStatus.completed) ...[
            const SizedBox(height: Space.grid),
            StatusBadge(
              context.l10n.waitForReception,
              icon: Icons.hourglass_empty,
              tone: 'warning',
              large: true,
            ),
          ],
          const SizedBox(height: Space.group),
        ],
      ),
      footer: work.status == WorkStatus.completed
          ? Container(
              height: Touch.mechanic,
              decoration: BoxDecoration(
                color: p.successSoft,
                borderRadius: BorderRadius.circular(Radii.control),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.check_circle, color: p.success, size: 28),
                  const SizedBox(width: Space.sm),
                  Text(
                    context.l10n.workDone,
                    style: Theme.of(
                      context,
                    ).textTheme.titleLarge?.copyWith(color: p.success),
                  ),
                ],
              ),
            )
          : action == WorkAction.start
          ? PillButton(
              label: context.l10n.startWork,
              icon: Icons.play_arrow_rounded,
              large: true,
              expand: true,
              busy: busy,
              onPressed: start,
            )
          : action == WorkAction.complete
          ? PillButton(
              label: context.l10n.completeWork,
              icon: Icons.flag_outlined,
              kind: PillKind.emerald,
              large: true,
              expand: true,
              busy: busy,
              onPressed: finish,
            )
          : null,
    );
  }
}
