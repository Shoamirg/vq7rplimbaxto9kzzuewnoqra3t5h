import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../data/customer_portal.dart';
import '../domain/models.dart';
import '../domain/portal.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../l10n/l10n.dart';

/// Car pill, problem, typographic date strip from the garage's today and
/// open time slots. Sending creates a request awaiting confirmation.
class CustomerBookingScreen extends StatefulWidget {
  const CustomerBookingScreen({
    super.key,
    required this.repository,
    this.vehicleId,
  });
  final CustomerBookingSource repository;
  final String? vehicleId;

  @override
  State<CustomerBookingScreen> createState() => _CustomerBookingScreenState();
}

class _CustomerBookingScreenState extends State<CustomerBookingScreen> {
  final _form = GlobalKey<FormState>();
  final _service = TextEditingController();
  List<CustomerPortalVehicle> _vehicles = const [];
  DateTime? _today;
  DateTime? _date;
  String? _vehicleId;
  String? _time;
  List<String>? _slots;
  bool _loading = true;
  bool _saving = false;
  bool _dirty = false;
  String? _error;
  int _slotRequest = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _service.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final values = await Future.wait<Object>([
        widget.repository.vehicles(),
        widget.repository.bookingToday(),
      ]);
      if (!mounted) return;
      final vehicles = values[0] as List<CustomerPortalVehicle>;
      final today = values[1] as DateTime;
      setState(() {
        _vehicles = vehicles;
        _today = DateTime(today.year, today.month, today.day);
        _vehicleId = vehicles.any((v) => v.id == widget.vehicleId)
            ? widget.vehicleId
            : vehicles.isEmpty
            ? null
            : vehicles.first.id;
        _loading = false;
      });
      await _pickDate(_today!);
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = failureText(error);
          _loading = false;
        });
      }
    }
  }

  Future<void> _pickDate(DateTime date) async {
    final request = ++_slotRequest;
    setState(() {
      _date = date;
      _slots = null;
      _time = null;
    });
    try {
      final slots = await widget.repository.slots(date);
      if (!mounted || request != _slotRequest) return;
      setState(() {
        _slots = slots;
        _time = slots.isEmpty ? null : slots.first;
      });
    } catch (error) {
      if (mounted && request == _slotRequest) {
        setState(() {
          _slots = const [];
          _error = failureText(error);
        });
      }
    }
  }

  Future<void> _submit() async {
    if (_saving || !validateForm(_form)) return;
    final vehicleId = _vehicleId;
    final date = _date;
    final time = _time;
    if (vehicleId == null || date == null) return;
    if (time == null) {
      setState(() => _error = context.l10n.pickTimeError);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final result = await widget.repository.bookAppointment(
        vehicleId: vehicleId,
        service: _service.text,
        date: date,
        time: time,
      );
      if (!mounted) return;
      if (result['status'] != 'pending') {
        throw const AppFailure('Server returned an unexpected booking status.');
      }
      Navigator.of(context).pop(true);
    } on AppFailure catch (error) {
      if (mounted) {
        setState(() {
          _error = error.uncertain
              ? context.l10n.bookingOutcomeUnknown
              : failureText(error);
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = failureText(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final today = _today;
    return PageFrame(
      title: context.l10n.bookService,
      isSaving: _saving,
      hasChanges: _dirty,
      body: _loading
          ? const SkeletonPage(layout: SkeletonLayout.detail)
          : _error != null && today == null
          ? ListView(
              padding: const EdgeInsets.all(Space.page),
              children: [ErrorNotice(_error!, retry: _load)],
            )
          : Form(
              key: _form,
              onChanged: () => _dirty = true,
              child: ListView(
                padding: const EdgeInsets.all(Space.page),
                children: [
                  Text(
                    context.l10n.bookingPendingHint,
                    style: Theme.of(
                      context,
                    ).textTheme.bodyMedium?.copyWith(color: p.secondary),
                  ),
                  const SizedBox(height: Space.grid),
                  if (_error != null) ErrorNotice(_error!),
                  if (_vehicles.isEmpty)
                    EmptyState(
                      icon: Icons.directions_car_outlined,
                      title: context.l10n.noCarsYet,
                      detail: context.l10n.bookingNoVehicles,
                    )
                  else ...[
                    SectionTitle(context.l10n.vehicle),
                    Wrap(
                      spacing: Space.sm,
                      runSpacing: Space.sm,
                      children: [
                        for (final vehicle in _vehicles)
                          _CarPill(
                            label: vehicle.label,
                            selected: vehicle.id == _vehicleId,
                            onTap: _saving
                                ? null
                                : () => setState(() => _vehicleId = vehicle.id),
                          ),
                      ],
                    ),
                    SectionTitle(context.l10n.bookingService),
                    TextFormField(
                      controller: _service,
                      maxLength: 120,
                      minLines: 2,
                      maxLines: 4,
                      enabled: !_saving,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: areaDecoration(
                        context,
                        label: context.l10n.problemLabel,
                        hint: context.l10n.bookingServiceHint,
                      ),
                      validator: (value) => value == null || value.trim().isEmpty
                          ? context.l10n.requiredField
                          : null,
                    ),
                    SectionTitle(context.l10n.bookingDate),
                    SizedBox(
                      height: 104,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: 14,
                        separatorBuilder: (_, _) =>
                            const SizedBox(width: Space.sm),
                        itemBuilder: (context, index) {
                          final day = today!.add(Duration(days: index));
                          return _DayCard(
                            day: day,
                            selected: _date != null && dateKey(day) == dateKey(_date!),
                            onTap: _saving ? null : () => _pickDate(day),
                          );
                        },
                      ),
                    ),
                    SectionTitle(context.l10n.bookingTime),
                    if (_slots == null)
                      Wrap(
                        spacing: Space.sm,
                        runSpacing: Space.sm,
                        children: [
                          for (var i = 0; i < 6; i++)
                            const SkeletonBlock(
                              width: 88,
                              height: 48,
                              radius: Radii.control,
                            ),
                        ],
                      )
                    else if (_slots!.isEmpty)
                      EmptyState(
                        icon: Icons.event_busy_outlined,
                        title: context.l10n.noSlots,
                      )
                    else
                      Wrap(
                        spacing: Space.sm,
                        runSpacing: Space.sm,
                        children: [
                          for (final slot in _slots!)
                            ChoiceChip(
                              label: Text(slot, style: context.numeral(16)),
                              selected: slot == _time,
                              showCheckmark: false,
                              materialTapTargetSize:
                                  MaterialTapTargetSize.padded,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 10,
                              ),
                              selectedColor: p.brand,
                              labelStyle: TextStyle(
                                color: slot == _time ? p.onBrand : p.text,
                              ),
                              onSelected: _saving
                                  ? null
                                  : (_) => setState(() => _time = slot),
                            ),
                        ],
                      ),
                  ],
                ],
              ),
            ),
      footer: _vehicles.isEmpty || _loading
          ? null
          : StickyActionBar(
              label: _date == null
                  ? context.l10n.bookingDate
                  : context.dayMonth(_date!),
              value: _time ?? '—',
              action: PillButton(
                label: context.l10n.sendBooking,
                icon: Icons.send_outlined,
                busy: _saving,
                onPressed: _submit,
              ),
            ),
      footerPadding: false,
    );
  }
}

class _CarPill extends StatelessWidget {
  const _CarPill({required this.label, required this.selected, this.onTap});
  final String label;
  final bool selected;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final plate = plateOf(label);
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? p.brand : p.elevated,
        shape: StadiumBorder(side: BorderSide(color: selected ? p.brand : p.border)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: Touch.standard),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.directions_car_outlined,
                    size: 18,
                    color: selected ? p.onBrand : p.secondary,
                  ),
                  const SizedBox(width: Space.sm),
                  Flexible(
                    child: Text(
                      plate == null ? label : withoutPlate(label),
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: selected ? p.onBrand : p.text,
                      ),
                    ),
                  ),
                  if (plate != null) ...[
                    const SizedBox(width: Space.sm),
                    Text(
                      formatPlate(plate),
                      style: context.mono(
                        size: 12,
                        color: selected ? p.onBrand : p.secondary,
                      ),
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

class _DayCard extends StatelessWidget {
  const _DayCard({required this.day, required this.selected, this.onTap});
  final DateTime day;
  final bool selected;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final fg = selected ? p.onBrand : p.text;
    return Semantics(
      button: true,
      selected: selected,
      label: context.date(day),
      excludeSemantics: true,
      child: Material(
        color: selected ? p.brand : p.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Radii.tile),
          side: BorderSide(color: selected ? p.brand : p.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            width: 72,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  context.weekday(day),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: selected ? p.onBrand : p.secondary,
                  ),
                ),
                Text('${day.day}', style: context.numeral(30, color: fg)),
                Text(
                  context.monthShort(day),
                  maxLines: 1,
                  overflow: TextOverflow.fade,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: selected ? p.onBrand : p.secondary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
