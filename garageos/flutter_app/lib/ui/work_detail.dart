import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../data/repository.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../domain/models.dart';
import '../domain/portal.dart';
import '../l10n/l10n.dart';
import 'billing.dart';
import 'customers.dart' show requiredText;

class WorkScreen extends StatefulWidget {
  const WorkScreen({super.key, required this.repository, required this.work});
  final GarageRepository repository;
  final Work work;
  @override
  State<WorkScreen> createState() => _WorkScreenState();
}

class _WorkScreenState extends State<WorkScreen> {
  late Work work = widget.work;
  Bill? linked;
  CustomerFile? contact;
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final current = await widget.repository.work(work.id);
      final invoice = current.status == WorkStatus.completed
          ? await widget.repository.billForWork(work.id)
          : null;
      if (mounted) {
        setState(() {
          work = current;
          linked = invoice;
        });
      }
      if (contact == null && widget.repository.canWrite) {
        // Phone and mileage live on the customer record; the job still
        // works without them.
        try {
          final file = await widget.repository.customerFile(
            Customer(current.customerId, current.customerName, ''),
            full: false,
          );
          if (mounted) setState(() => contact = file);
        } catch (_) {}
      }
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> change(String action, [Json? data]) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await widget.repository.changeWork(work.id, action, data);
      if (mounted) setState(() => work = result);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> assign() async {
    final mechanic = await openPage<Mechanic>(
      context,
      MechanicPicker(repository: widget.repository, initial: work.mechanic),
    );
    if (mechanic != null && mounted) {
      await change('assign-mechanic', {'mechanic_user_id': mechanic.id});
    }
  }

  Future<void> cancel() async {
    final reason = await textSheet(
      context,
      title: context.l10n.cancelAppointment,
      message: context.l10n.cancelAppointmentHint,
      label: context.l10n.optionalReason,
      confirmLabel: context.l10n.cancelAppointment,
      destructive: true,
    );
    if (reason != null && mounted) await change('cancel', {'reason': reason});
  }

  Future<void> invoice() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final existing = await widget.repository.billForWork(work.id);
      if (!mounted) return;
      if (existing != null) {
        await openPage(
          context,
          BillScreen(repository: widget.repository, bill: existing),
        );
      } else {
        if (!widget.repository.canWrite) {
          throw const AppFailure('Bu amal uchun ruxsat yoʻq.', status: 403);
        }
        final created = await openPage<Bill>(
          context,
          BillForm(repository: widget.repository, work: work),
        );
        if (created != null && mounted) {
          await openPage(
            context,
            BillScreen(repository: widget.repository, bill: created),
          );
        }
      }
      if (mounted) await reload();
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Car? get car {
    final cars = contact?.cars.where((c) => c.id == work.vehicleId);
    return cars == null || cars.isEmpty ? null : cars.first;
  }

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final canAssign = widget.repository.canWrite && work.canAssignMechanic;
    final action = widget.repository.primaryWorkAction(
      work,
      hasInvoice: linked != null,
    );
    final label = switch (action) {
      WorkAction.confirm => context.l10n.confirmAppointment,
      WorkAction.assign => context.l10n.assignMechanic,
      WorkAction.start => context.l10n.startWork,
      WorkAction.complete => context.l10n.completeWork,
      WorkAction.createInvoice => context.l10n.createInvoice,
      WorkAction.openInvoice => context.l10n.openInvoice,
      null => null,
    };
    final phone = contact?.customer.phone;
    return PageFrame(
      title: context.l10n.serviceWork,
      demo: widget.repository.isDemo,
      readOnly: !widget.repository.canPerformWork,
      actions: [
        IconButton(
          tooltip: context.l10n.refresh,
          onPressed: busy ? null : reload,
          icon: Icon(Icons.refresh),
        ),
      ],
      body: RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.all(Space.page),
          children: [
            if (busy) LinearProgressIndicator(minHeight: 2),
            if (busy) SizedBox(height: Space.md),
            if (error != null) ErrorNotice(error!, retry: reload),
            BentoCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: Space.sm,
                    runSpacing: Space.sm,
                    children: [
                      Plate(work.plate),
                      WorkStatusChip(work.status),
                    ],
                  ),
                  SizedBox(height: Space.md),
                  Text(work.car, style: Theme.of(context).textTheme.titleLarge),
                  if (car != null)
                    Text(
                      '${car!.year} · ${context.km(car!.km)}',
                      style: context.mono(color: p.secondary),
                    ),
                  Divider(),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              work.customerName,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            if (phone != null && phone.isNotEmpty)
                              Text(
                                formatPhone(phone),
                                style: context.mono(color: p.secondary),
                              ),
                          ],
                        ),
                      ),
                      if (phone != null && phone.isNotEmpty)
                        IconButton.filledTonal(
                          tooltip: context.l10n.callCustomer,
                          style: IconButton.styleFrom(
                            minimumSize: const Size(52, 52),
                          ),
                          onPressed: () => callNumber(context, phone),
                          icon: const Icon(Icons.call_outlined),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            SizedBox(height: Space.grid),
            DateSlotCard(
              day: context.dayMonth(work.date),
              time: work.time,
              duration: context.l10n.minutes(work.duration),
              title: context.l10n.appointments,
            ),
            SizedBox(height: Space.grid),
            BentoGrid(
              square: false,
              children: [
                BentoTile(
                  icon: Icons.build_outlined,
                  label: context.l10n.serviceType,
                  valueWidget: Text(
                    work.serviceLabel ?? context.l10n.generalService,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                BentoTile(
                  icon: Icons.engineering_outlined,
                  tone: work.mechanic == null ? 'warning' : null,
                  label: context.l10n.mechanic,
                  valueWidget: Text(
                    work.mechanic ?? context.l10n.unassigned,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  footer: canAssign
                      ? TextButton(
                          onPressed: busy ? null : assign,
                          child: Text(context.l10n.changeMechanic),
                        )
                      : null,
                ),
              ],
            ),
            SectionTitle(context.l10n.customerConcern),
            BentoCard(
              child: Text(
                work.customerNotes?.trim().isNotEmpty == true
                    ? work.customerNotes!
                    : context.l10n.noNotes,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            ),
            if (work.notes?.trim().isNotEmpty == true) ...[
              SectionTitle(context.l10n.staffNotes),
              BentoCard(child: Text(work.notes!)),
            ],
            SectionTitle(context.l10n.statusTimeline),
            BentoCard(child: StatusTimeline(status: work.status)),
            if (linked != null) ...[
              SizedBox(height: Space.grid),
              BentoCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: Space.sm,
                      runSpacing: Space.sm,
                      children: [
                        MonoBadge(linked!.code),
                        BillStatusChip(linked!.status),
                      ],
                    ),
                    Pair(
                      context.l10n.total,
                      context.money(linked!.total, linked!.currency),
                      emphasis: true,
                    ),
                    Pair(
                      context.l10n.balance,
                      context.money(linked!.balance, linked!.currency),
                    ),
                  ],
                ),
              ),
            ],
            if (widget.repository.canWrite && work.canCancel) ...[
              SizedBox(height: Space.group),
              PillButton(
                label: context.l10n.cancelAppointment,
                icon: Icons.event_busy_outlined,
                kind: PillKind.quiet,
                expand: true,
                onPressed: busy ? null : cancel,
              ),
            ],
          ],
        ),
      ),
      footer: label == null
          ? null
          : SaveButton(
              label: label,
              busy: busy,
              icon: switch (action) {
                WorkAction.confirm => Icons.check,
                WorkAction.assign => Icons.engineering_outlined,
                WorkAction.start => Icons.play_arrow_rounded,
                WorkAction.complete => Icons.flag_outlined,
                _ => Icons.receipt_long_outlined,
              },
              kind: action == WorkAction.createInvoice ||
                      action == WorkAction.openInvoice
                  ? PillKind.emerald
                  : PillKind.primary,
              onPressed: () async {
                switch (action) {
                  case WorkAction.confirm:
                    await change('confirm');
                  case WorkAction.assign:
                    await assign();
                  case WorkAction.start:
                    await change('start');
                  case WorkAction.complete:
                    final result = await openPage<Work>(
                      context,
                      CompleteForm(repository: widget.repository, work: work),
                    );
                    if (result != null && mounted) {
                      setState(() => work = result);
                    }
                  case WorkAction.createInvoice:
                  case WorkAction.openInvoice:
                    await invoice();
                  case null:
                    break;
                }
              },
            ),
    );
  }
}

/// Pending → confirmed → in the workshop → finished, with the cancelled and
/// moved branches shown as a final state.
class StatusTimeline extends StatelessWidget {
  const StatusTimeline({super.key, required this.status});
  final WorkStatus status;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    const flow = [
      WorkStatus.pending,
      WorkStatus.confirmed,
      WorkStatus.inProgress,
      WorkStatus.completed,
    ];
    final off = !flow.contains(status);
    final reachedIndex = off ? -1 : flow.indexOf(status);
    final steps = [...flow, if (off) status];
    return Column(
      children: [
        for (var i = 0; i < steps.length; i++)
          Semantics(
            label:
                '${context.message(steps[i].label)}${steps[i] == status ? ', ${context.l10n.currentStep}' : ''}',
            excludeSemantics: true,
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Column(
                    children: [
                      Builder(
                        builder: (context) {
                          final reached =
                              steps[i] == status || i <= reachedIndex;
                          final (fg, bg) = toneColors(
                            context,
                            workTone(steps[i]) == 'neutral'
                                ? null
                                : workTone(steps[i]),
                          );
                          return Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              color: reached ? bg : p.surface,
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: reached ? fg : p.border,
                                width: 2,
                              ),
                            ),
                            child: Icon(
                              workIcon(steps[i]),
                              size: 16,
                              color: reached ? fg : p.secondary,
                            ),
                          );
                        },
                      ),
                      if (i < steps.length - 1)
                        Expanded(child: Container(width: 2, color: p.border)),
                    ],
                  ),
                  const SizedBox(width: Space.md),
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(
                        top: 5,
                        bottom: i < steps.length - 1 ? Space.md : 0,
                      ),
                      child: Text(
                        context.message(steps[i].label),
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: steps[i] == status ? FontWeight.w700 : null,
                          color: steps[i] == status || i <= reachedIndex
                              ? p.text
                              : p.secondary,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class MechanicPicker extends StatelessWidget {
  const MechanicPicker({super.key, required this.repository, this.initial});
  final GarageRepository repository;
  final String? initial;
  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.assignMechanic,
    demo: repository.isDemo,
    body: ListLoadView<List<Mechanic>>(
      storageKey: 'mechanic-account-picker',
      loadKey: repository,
      filterKey: repository,
      load: repository.mechanics,
      header: (data, reload, loading) => [
        Text(
          context.l10n.mechanicAccountHint,
          style: TextStyle(color: context.colors.secondary),
        ),
        if (initial != null) Pair(context.l10n.mechanic, initial!),
        const SizedBox(height: Space.grid),
        if (loading && data == null)
          LinearProgressIndicator(
            minHeight: 2,
            semanticsLabel: context.l10n.loading,
          ),
      ],
      items: (data, reload) => [
        if (data.isEmpty)
          EmptyNotice(
            context.l10n.noMechanics,
            context.l10n.mechanicAccountHint,
            icon: Icons.engineering_outlined,
          ),
        for (final mechanic in data)
          Padding(
            padding: const EdgeInsets.only(bottom: Space.md),
            child: BentoCard(
              padding: const EdgeInsets.all(Space.tile),
              onTap: () => Navigator.pop(context, mechanic),
              child: Row(
                children: [
                  IconSquare(Icons.engineering_outlined),
                  const SizedBox(width: Space.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          mechanic.name,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        Text(
                          mechanic.email,
                          style: TextStyle(color: context.colors.secondary),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ),
          ),
      ],
    ),
  );
}

class CompleteForm extends StatefulWidget {
  const CompleteForm({super.key, required this.repository, required this.work});
  final GarageRepository repository;
  final Work work;
  @override
  State<CompleteForm> createState() => _CompleteFormState();
}

class _CompleteFormState extends State<CompleteForm> {
  final form = GlobalKey<FormState>();
  final type = TextEditingController(),
      notes = TextEditingController(),
      km = TextEditingController();
  bool busy = false, dirty = false;
  String? error;
  bool typeEdited = false, updatingDefault = false;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final fallback = widget.work.serviceLabel ?? context.l10n.generalService;
    if (!typeEdited && type.text != fallback) {
      updatingDefault = true;
      type.text = fallback;
      updatingDefault = false;
    }
  }

  @override
  void dispose() {
    type.dispose();
    notes.dispose();
    km.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (!validateForm(form)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final work = await widget.repository.changeWork(
        widget.work.id,
        'complete',
        {
          'service_type': type.text.trim(),
          'notes': notes.text.trim().isEmpty ? null : notes.text.trim(),
          'odometer_km': int.tryParse(km.text),
        },
      );
      if (mounted) Navigator.pop(context, work);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.completeWork,
    demo: widget.repository.isDemo,
    hasChanges: dirty,
    isSaving: busy,
    body: Form(
      key: form,
      autovalidateMode: dirty
          ? AutovalidateMode.onUserInteraction
          : AutovalidateMode.disabled,
      onChanged: () {
        if (!updatingDefault) setState(() => dirty = true);
      },
      child: ListView(
        padding: EdgeInsets.all(Space.page),
        children: [
          BentoCard(
            padding: const EdgeInsets.all(Space.tile),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.work.car,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                Plate(widget.work.plate),
              ],
            ),
          ),
          SizedBox(height: Space.group),
          if (error != null) ErrorNotice(error!),
          TextFormField(
            controller: type,
            enabled: !busy,
            onChanged: (_) => typeEdited = true,
            maxLength: 100,
            validator: (value) => context.validation(requiredText(value)),
            decoration: InputDecoration(
              labelText: context.l10n.completedService,
            ),
          ),
          SizedBox(height: Space.md),
          TextFormField(
            controller: notes,
            enabled: !busy,
            maxLines: 3,
            maxLength: 1000,
            decoration: areaDecoration(
              context,
              label: context.l10n.completionNotes,
            ),
          ),
          SizedBox(height: Space.md),
          TextFormField(
            controller: km,
            enabled: !busy,
            keyboardType: TextInputType.number,
            style: context.mono(size: 16),
            decoration: InputDecoration(
              labelText: context.l10n.optionalOdometer,
              suffixText: 'km',
            ),
            validator: (v) {
              if (v == null || v.isEmpty) return null;
              final n = int.tryParse(v);
              return n != null && n >= 0 && n <= 2147483647
                  ? null
                  : context.l10n.odometerError;
            },
          ),
          SizedBox(height: Space.md),
          Text(
            widget.repository.isMechanic
                ? context.l10n.mechanicCompleteHint
                : context.l10n.completeWorkHint,
            style: TextStyle(color: context.colors.secondary),
          ),
        ],
      ),
    ),
    footer: Row(
      children: [
        PillButton(
          label: context.l10n.back,
          kind: PillKind.secondary,
          onPressed: busy ? null : () => Navigator.maybePop(context),
        ),
        SizedBox(width: 8),
        Expanded(
          child: SaveButton(
            label: context.l10n.workCompleted,
            icon: Icons.flag_outlined,
            onPressed: save,
            busy: busy,
          ),
        ),
      ],
    ),
  );
}
