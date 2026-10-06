import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../data/repository.dart';
import '../design/theme.dart';
import '../l10n/l10n.dart';
import '../design/widgets.dart';
import '../domain/models.dart';
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
    if (!widget.repository.isDemo) {
      final mechanic = await openPage<Mechanic>(
        context,
        MechanicPicker(repository: widget.repository, initial: work.mechanic),
      );
      if (mechanic != null && mounted) {
        await change('assign-mechanic', {'mechanic_user_id': mechanic.id});
      }
      return;
    }
    final name = await showDialog<String>(
      context: context,
      builder: (context) => MechanicDialog(initial: work.mechanic),
    );
    if (name != null && mounted) {
      await change('assign-mechanic', {'mechanic_name': name});
    }
  }

  Future<void> cancel() async {
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => const CancelDialog(),
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

  @override
  Widget build(BuildContext context) {
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
      body: ListView(
        padding: EdgeInsets.all(Space.page),
        children: [
          if (busy) LinearProgressIndicator(),
          if (busy) SizedBox(height: 16),
          if (error != null) ErrorNotice(error!, retry: reload),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    Plate(work.plate),
                    StatusBadge(
                      context.message(work.status.label),
                      tone: workTone(work.status),
                    ),
                  ],
                ),
                SizedBox(height: 16),
                Text(work.car, style: Theme.of(context).textTheme.titleLarge),
                SizedBox(height: 4),
                Text(work.customerName),
                Divider(),
                Pair(
                  context.l10n.appointments,
                  '${context.date(work.date)} · ${work.time}',
                ),
                Pair(
                  context.l10n.duration,
                  context.l10n.minutes(work.duration),
                ),
                Pair(
                  context.l10n.mechanic,
                  work.mechanic ?? context.l10n.unassigned,
                ),
                if (canAssign)
                  OutlinedButton.icon(
                    onPressed: busy ? null : assign,
                    icon: Icon(Icons.person_outline),
                    label: Text(context.l10n.changeMechanic),
                  ),
              ],
            ),
          ),
          SizedBox(height: 24),
          Text(
            context.l10n.customerConcern,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          SizedBox(height: 12),
          Panel(
            child: Text(
              work.customerNotes?.trim().isNotEmpty == true
                  ? work.customerNotes!
                  : context.l10n.noNotes,
            ),
          ),
          if (work.serviceType != null) ...[
            SizedBox(height: 16),
            Pair(context.l10n.serviceType, work.serviceType!),
          ],
          if (work.notes?.trim().isNotEmpty == true) ...[
            SizedBox(height: 24),
            Text(
              context.l10n.staffNotes,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            SizedBox(height: 12),
            Panel(child: Text(work.notes!)),
          ],
          if (linked != null) ...[
            SizedBox(height: 24),
            Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(linked!.code),
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
            SizedBox(height: 24),
            TextButton.icon(
              onPressed: busy ? null : cancel,
              icon: Icon(Icons.event_busy_outlined),
              label: Text(context.l10n.cancelAppointment),
            ),
          ],
        ],
      ),
      footer: label == null
          ? null
          : SaveButton(
              label: label,
              busy: busy,
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

class MechanicPicker extends StatefulWidget {
  const MechanicPicker({super.key, required this.repository, this.initial});
  final GarageRepository repository;
  final String? initial;
  @override
  State<MechanicPicker> createState() => _MechanicPickerState();
}

class _MechanicPickerState extends State<MechanicPicker> {
  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.assignMechanic,
    demo: widget.repository.isDemo,
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: Space.contentWidth),
        child: ListLoadView<List<Mechanic>>(
          storageKey: 'mechanic-account-picker',
          loadKey: widget.repository,
          filterKey: widget.repository,
          load: widget.repository.mechanics,
          header: (data, reload, loading) => [
            Text(context.l10n.mechanicAccountHint),
            if (widget.initial != null)
              Pair(context.l10n.mechanic, widget.initial!),
            const SizedBox(height: Space.group),
          ],
          items: (data, reload) => [
            if (data.isEmpty)
              EmptyNotice(
                context.l10n.noMechanics,
                context.l10n.mechanicAccountHint,
              ),
            for (final mechanic in data)
              ListTile(
                title: Text(mechanic.name),
                subtitle: Text(mechanic.email),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.pop(context, mechanic),
              ),
          ],
        ),
      ),
    ),
  );
}

class MechanicDialog extends StatefulWidget {
  const MechanicDialog({super.key, this.initial});
  final String? initial;
  @override
  State<MechanicDialog> createState() => _MechanicDialogState();
}

class _MechanicDialogState extends State<MechanicDialog> {
  final form = GlobalKey<FormState>();
  late final name = TextEditingController(text: widget.initial);
  @override
  void dispose() {
    name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(context.l10n.assignMechanic),
    content: Form(
      key: form,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      child: TextFormField(
        controller: name,
        autofocus: MediaQuery.sizeOf(context).width >= Space.tablet,
        maxLength: 255,
        decoration: InputDecoration(labelText: context.l10n.mechanicName),
        validator: (value) => context.validation(requiredText(value)),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: Text(context.l10n.cancel),
      ),
      FilledButton(
        onPressed: () {
          if (validateForm(form)) {
            Navigator.pop(context, name.text.trim());
          }
        },
        child: Text(context.l10n.assign),
      ),
    ],
  );
}

class CancelDialog extends StatefulWidget {
  const CancelDialog({super.key});
  @override
  State<CancelDialog> createState() => _CancelDialogState();
}

class _CancelDialogState extends State<CancelDialog> {
  final reason = TextEditingController();
  @override
  void dispose() {
    reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(context.l10n.cancelAppointment),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(context.l10n.cancelAppointmentHint),
          SizedBox(height: 16),
          TextField(
            controller: reason,
            maxLength: 1000,
            maxLines: 3,
            decoration: InputDecoration(labelText: context.l10n.optionalReason),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: Text(context.l10n.stay),
      ),
      FilledButton(
        onPressed: () => Navigator.pop(context, reason.text.trim()),
        child: Text(context.l10n.cancel),
      ),
    ],
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
    if (!typeEdited && type.text != context.l10n.generalService) {
      updatingDefault = true;
      type.text = context.l10n.generalService;
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
          Plate(widget.work.plate),
          SizedBox(height: 16),
          Text(widget.work.car, style: Theme.of(context).textTheme.titleMedium),
          SizedBox(height: 24),
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
          SizedBox(height: 16),
          TextFormField(
            controller: notes,
            enabled: !busy,
            maxLines: 3,
            maxLength: 1000,
            decoration: InputDecoration(
              labelText: context.l10n.completionNotes,
            ),
          ),
          SizedBox(height: 16),
          TextFormField(
            controller: km,
            enabled: !busy,
            keyboardType: TextInputType.number,
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
          SizedBox(height: 16),
          Text(
            widget.repository.isMechanic
                ? context.l10n.mechanicCompleteHint
                : context.l10n.completeWorkHint,
          ),
        ],
      ),
    ),
    footer: Row(
      children: [
        TextButton(
          onPressed: busy ? null : () => Navigator.maybePop(context),
          child: Text(context.l10n.back),
        ),
        SizedBox(width: 8),
        Expanded(
          child: SaveButton(
            label: context.l10n.workCompleted,
            onPressed: save,
            busy: busy,
          ),
        ),
      ],
    ),
  );
}
