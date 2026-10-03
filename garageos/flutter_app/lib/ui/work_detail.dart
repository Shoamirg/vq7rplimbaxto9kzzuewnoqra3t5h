import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../data/repository.dart';
import '../design/theme.dart';
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
    final canAssign = work.canAssignMechanic;
    final label = switch (work.status) {
      WorkStatus.pending => 'Navbatni tasdiqlash',
      WorkStatus.confirmed =>
        (work.mechanic?.trim().isNotEmpty ?? false)
            ? 'Ishni boshlash'
            : 'Usta tayinlash',
      WorkStatus.inProgress => 'Ishni tugatish',
      WorkStatus.completed =>
        linked == null ? 'Hisob yaratish' : 'Hisobni ochish',
      _ => null,
    };
    return PageFrame(
      title: 'Servis ishi',
      demo: widget.repository.isDemo,
      actions: [
        IconButton(
          tooltip: 'Yangilash',
          onPressed: busy ? null : reload,
          icon: const Icon(Icons.refresh),
        ),
      ],
      body: ListView(
        padding: const EdgeInsets.all(Space.page),
        children: [
          if (busy) const LinearProgressIndicator(),
          if (busy) const SizedBox(height: 16),
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
                    StatusBadge(work.status.label, tone: workTone(work.status)),
                  ],
                ),
                const SizedBox(height: 16),
                Text(work.car, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 4),
                Text(work.customerName),
                const Divider(),
                Pair('Navbat', '${dateLabel(work.date)} · ${work.time}'),
                Pair('Davomiyligi', '${work.duration} daqiqa'),
                Pair('Usta', work.mechanic ?? 'Tayinlanmagan'),
                if (canAssign)
                  OutlinedButton.icon(
                    onPressed: busy ? null : assign,
                    icon: const Icon(Icons.person_outline),
                    label: const Text('Ustani tanlash / oʻzgartirish'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Mijoz shikoyati',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          Panel(
            child: Text(
              work.customerNotes?.trim().isNotEmpty == true
                  ? work.customerNotes!
                  : 'Izoh kiritilmagan.',
            ),
          ),
          if (work.serviceType != null) ...[
            const SizedBox(height: 16),
            Pair('Xizmat turi', work.serviceType!),
          ],
          if (work.notes?.trim().isNotEmpty == true) ...[
            const SizedBox(height: 24),
            Text(
              'Bajarilgan ishlar / xodim izohi',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            Panel(child: Text(work.notes!)),
          ],
          if (linked != null) ...[
            const SizedBox(height: 24),
            Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(linked!.code),
                  Pair(
                    'Jami',
                    linked!.total.format(linked!.currency),
                    emphasis: true,
                  ),
                  Pair('Qoldiq', linked!.balance.format(linked!.currency)),
                ],
              ),
            ),
          ],
          if (work.canCancel) ...[
            const SizedBox(height: 24),
            TextButton.icon(
              onPressed: busy ? null : cancel,
              icon: const Icon(Icons.event_busy_outlined),
              label: const Text('Navbatni bekor qilish'),
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
                switch (work.status) {
                  case WorkStatus.pending:
                    await change('confirm');
                  case WorkStatus.confirmed:
                    if (work.mechanic?.trim().isNotEmpty == true) {
                      await change('start');
                    } else {
                      await assign();
                    }
                  case WorkStatus.inProgress:
                    final result = await openPage<Work>(
                      context,
                      CompleteForm(repository: widget.repository, work: work),
                    );
                    if (result != null && mounted) {
                      setState(() => work = result);
                    }
                  case WorkStatus.completed:
                    await invoice();
                  default:
                    break;
                }
              },
            ),
    );
  }
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
    title: const Text('Usta tayinlash'),
    content: Form(
      key: form,
      child: TextFormField(
        controller: name,
        autofocus: MediaQuery.sizeOf(context).width >= Space.tablet,
        maxLength: 255,
        decoration: const InputDecoration(labelText: 'Ustaning ismi'),
        validator: requiredText,
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Bekor qilish'),
      ),
      FilledButton(
        onPressed: () {
          if (validateForm(form)) {
            Navigator.pop(context, name.text.trim());
          }
        },
        child: const Text('Tayinlash'),
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
    title: const Text('Navbatni bekor qilish'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('Navbat bekor qilinadi va vaqt boʻshaydi.'),
          const SizedBox(height: 16),
          TextField(
            controller: reason,
            maxLength: 1000,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Sabab (ixtiyoriy)'),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Qolish'),
      ),
      FilledButton(
        onPressed: () => Navigator.pop(context, reason.text.trim()),
        child: const Text('Bekor qilish'),
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
  final type = TextEditingController(text: 'Umumiy servis'),
      notes = TextEditingController(),
      km = TextEditingController();
  bool busy = false, dirty = false;
  String? error;
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
    title: 'Ishni tugatish',
    demo: widget.repository.isDemo,
    hasChanges: dirty,
    isSaving: busy,
    body: Form(
      key: form,
      onChanged: () => setState(() => dirty = true),
      child: ListView(
        padding: const EdgeInsets.all(Space.page),
        children: [
          Plate(widget.work.plate),
          const SizedBox(height: 16),
          Text(widget.work.car, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 24),
          if (error != null) ErrorNotice(error!),
          TextFormField(
            controller: type,
            enabled: !busy,
            maxLength: 100,
            validator: requiredText,
            decoration: const InputDecoration(labelText: 'Bajarilgan xizmat'),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: notes,
            enabled: !busy,
            maxLines: 3,
            maxLength: 1000,
            decoration: const InputDecoration(
              labelText: 'Bajarilgan ishlar haqida izoh',
            ),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: km,
            enabled: !busy,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Yurgan masofa (ixtiyoriy)',
              suffixText: 'km',
            ),
            validator: (v) {
              if (v == null || v.isEmpty) return null;
              final n = int.tryParse(v);
              return n != null && n >= 0 && n <= 2147483647
                  ? null
                  : 'Toʻgʻri masofani kiriting.';
            },
          ),
          const SizedBox(height: 16),
          const Text(
            'Servis tarixi saqlanadi. Keyin shu ish ichidan hisob yaratishingiz mumkin.',
          ),
        ],
      ),
    ),
    footer: Row(
      children: [
        TextButton(
          onPressed: busy ? null : () => Navigator.maybePop(context),
          child: const Text('Ortga'),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: SaveButton(label: 'Ish tugadi', onPressed: save, busy: busy),
        ),
      ],
    ),
  );
}
