import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../data/repository.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../domain/models.dart';
import '../l10n/l10n.dart';
import 'customers.dart';
import 'work_detail.dart';

/// New job: fast walk-in/call intake.
class BookingScreen extends StatefulWidget {
  const BookingScreen({
    super.key,
    required this.repository,
    this.customer,
    this.car,
  });
  final GarageRepository repository;
  final Customer? customer;
  final Car? car;
  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
  final form = GlobalKey<FormState>();
  final service = TextEditingController(), notes = TextEditingController();
  Mechanic? mechanic;
  late Customer? customer = widget.customer;
  late Car? car = widget.car;
  List<Car> cars = [];
  late DateTime today = civilDate(dateKey(DateTime.now()));
  late DateTime date = today;
  TimeOfDay time = TimeOfDay(hour: 10, minute: 0);
  int duration = 60;
  bool busy = false, loadingCars = false, dirty = false;
  int carsRequest = 0;
  String? error;
  bool get writable => widget.repository.canWrite;
  @override
  void initState() {
    super.initState();
    if (customer != null) loadCars();
  }

  @override
  void dispose() {
    service.dispose();
    notes.dispose();
    super.dispose();
  }

  Future<void> loadCars() async {
    final owner = customer!.id;
    final request = ++carsRequest;
    setState(() {
      loadingCars = true;
      error = null;
    });
    try {
      final data = await widget.repository.cars(owner);
      if (mounted && customer?.id == owner && request == carsRequest) {
        setState(() {
          cars = data;
          loadingCars = false;
          if (car == null && data.length == 1) car = data.first;
        });
      }
    } catch (e) {
      if (mounted && customer?.id == owner && request == carsRequest) {
        setState(() {
          loadingCars = false;
          error = failureText(e);
        });
      }
    }
  }

  Future<void> pickCustomer() async {
    final selected = await openPage<Customer>(
      context,
      CustomerPicker(repository: widget.repository),
    );
    if (selected == null || !mounted) return;
    setState(() {
      customer = selected;
      dirty = true;
      car = null;
      cars = [];
    });
    await loadCars();
  }

  Future<void> pickTime() async {
    final selected = await showTimePicker(
      context: context,
      initialTime: time,
      builder: (c, child) => MediaQuery(
        data: MediaQuery.of(c).copyWith(alwaysUse24HourFormat: true),
        child: child!,
      ),
    );
    if (selected != null && mounted) {
      setState(() {
        time = selected;
        dirty = true;
      });
    }
  }

  Future<void> pickDate() async {
    final selected = await showDatePicker(
      context: context,
      initialDate: date,
      firstDate: today.subtract(const Duration(days: 1)),
      lastDate: today.add(const Duration(days: 365)),
    );
    if (selected != null && mounted) {
      setState(() {
        date = selected;
        dirty = true;
      });
    }
  }

  String get clock =>
      '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';

  Future<void> save() async {
    if (!writable || busy) return;
    if (!validateForm(form)) return;
    if (customer == null || car == null) {
      setState(() => error = context.l10n.pickCustomerError);
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    // Direct bookings carry the requested service as the first line of the
    // customer's request; the job card reads it back from there.
    final request = [
      service.text.trim(),
      notes.text.trim(),
    ].where((part) => part.isNotEmpty).join('\n');
    try {
      final created = await widget.repository.createWork({
        'customer_id': customer!.id,
        'vehicle_id': car!.id,
        'appointment_date': dateKey(date),
        'appointment_time': clock,
        'estimated_duration_minutes': duration,
        'mechanic_user_id': mechanic?.id,
        'customer_notes': request.isEmpty ? null : request,
      });
      if (mounted) Navigator.pop(context, created);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final enabled = !busy && writable;
    return PageFrame(
      title: context.l10n.newAppointment,
      demo: widget.repository.isDemo,
      readOnly: !writable,
      hasChanges: dirty,
      isSaving: busy,
      body: Form(
        key: form,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        onChanged: () => setState(() => dirty = true),
        child: ListView(
          padding: EdgeInsets.all(Space.page),
          children: [
            if (error != null) ErrorNotice(error!),
            BentoCard(
              padding: const EdgeInsets.all(Space.tile),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      IconSquare(Icons.person_outline),
                      const SizedBox(width: Space.md),
                      Expanded(
                        child: customer == null
                            ? Text(
                                context.l10n.customer,
                                style: Theme.of(context).textTheme.titleMedium,
                              )
                            : Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    customer!.name,
                                    style: Theme.of(
                                      context,
                                    ).textTheme.titleMedium,
                                  ),
                                  Text(
                                    formatPhone(customer!.phone),
                                    style: context.mono(color: p.secondary),
                                  ),
                                ],
                              ),
                      ),
                    ],
                  ),
                  const SizedBox(height: Space.md),
                  PillButton(
                    label: customer == null
                        ? context.l10n.chooseCustomer
                        : context.l10n.changeCustomer,
                    icon: Icons.person_search_outlined,
                    kind: PillKind.secondary,
                    onPressed: enabled ? pickCustomer : null,
                  ),
                ],
              ),
            ),
            SectionTitle(context.l10n.vehicle),
            if (loadingCars)
              LinearProgressIndicator(
                minHeight: 2,
                semanticsLabel: context.l10n.loading,
              ),
            for (final item in cars)
              Padding(
                padding: EdgeInsets.only(bottom: Space.sm),
                child: BentoCard(
                  padding: const EdgeInsets.all(Space.tile),
                  borderColor: car?.id == item.id ? p.brand : null,
                  onTap: enabled
                      ? () => setState(() {
                          car = item;
                          dirty = true;
                        })
                      : null,
                  semanticLabel: '${item.modelLabel} ${formatPlate(item.plate)}',
                  child: Row(
                    children: [
                      Icon(
                        car?.id == item.id
                            ? Icons.radio_button_checked
                            : Icons.radio_button_off,
                        color: car?.id == item.id ? p.brand : p.secondary,
                      ),
                      const SizedBox(width: Space.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.modelLabel,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            Text(
                              '${item.year} · ${context.km(item.km)}',
                              style: context.mono(size: 12, color: p.secondary),
                            ),
                          ],
                        ),
                      ),
                      Plate(item.plate),
                    ],
                  ),
                ),
              ),
            if (customer != null)
              Align(
                alignment: Alignment.centerLeft,
                child: PillButton(
                  label: context.l10n.addVehicle,
                  icon: Icons.add,
                  kind: PillKind.quiet,
                  onPressed: !enabled || loadingCars
                      ? null
                      : () async {
                          final added = await openPage<Car>(
                            context,
                            CarForm(
                              repository: widget.repository,
                              customer: customer!,
                            ),
                          );
                          if (added != null && mounted) {
                            car = added;
                            dirty = true;
                            await loadCars();
                          }
                        },
                ),
              ),
            SectionTitle(
              context.l10n.timeAndService,
              trailing: IconButton(
                tooltip: context.l10n.pickDate,
                onPressed: enabled ? pickDate : null,
                icon: const Icon(Icons.calendar_month_outlined),
              ),
            ),
            SizedBox(
              height: 92,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: 14,
                separatorBuilder: (_, _) => const SizedBox(width: Space.sm),
                itemBuilder: (context, index) {
                  final day = today.add(Duration(days: index));
                  final selected = dateKey(day) == dateKey(date);
                  return _DayPill(
                    day: day,
                    selected: selected,
                    onTap: enabled
                        ? () => setState(() {
                            date = day;
                            dirty = true;
                          })
                        : null,
                  );
                },
              ),
            ),
            if (date.isBefore(today) ||
                date.isAfter(today.add(const Duration(days: 13)))) ...[
              const SizedBox(height: Space.sm),
              StatusBadge(
                context.date(date),
                icon: Icons.event_outlined,
                tone: 'strong',
              ),
            ],
            const SizedBox(height: Space.md),
            BentoGrid(
              square: false,
              children: [
                BentoTile(
                  icon: Icons.schedule,
                  label: context.l10n.bookingTime,
                  value: clock,
                  onTap: enabled ? pickTime : null,
                ),
                BentoTile(
                  icon: Icons.timer_outlined,
                  label: context.l10n.duration,
                  valueWidget: DropdownButtonHideUnderline(
                    child: DropdownButton<int>(
                      value: duration,
                      isExpanded: true,
                      style: context.numeral(18),
                      items: [30, 45, 60, 90, 120, 180, 240]
                          .map(
                            (n) => DropdownMenuItem(
                              value: n,
                              child: Text(context.l10n.minutes(n)),
                            ),
                          )
                          .toList(),
                      onChanged: enabled
                          ? (v) => setState(() {
                              duration = v!;
                              dirty = true;
                            })
                          : null,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: Space.md),
            TextFormField(
              controller: service,
              enabled: enabled,
              maxLength: 100,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                labelText: context.l10n.serviceType,
                hintText: context.l10n.bookingServiceHint,
                prefixIcon: const Icon(Icons.build_outlined),
              ),
            ),
            SectionTitle(context.l10n.mechanic),
            BentoCard(
              padding: const EdgeInsets.all(Space.tile),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      IconSquare(
                        Icons.engineering_outlined,
                        tone: mechanic == null ? null : 'success',
                      ),
                      const SizedBox(width: Space.md),
                      Expanded(
                        child: mechanic == null
                            ? Text(context.l10n.unassigned)
                            : Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    mechanic!.name,
                                    style: Theme.of(
                                      context,
                                    ).textTheme.titleMedium,
                                  ),
                                  Text(
                                    mechanic!.email,
                                    style: TextStyle(color: p.secondary),
                                  ),
                                ],
                              ),
                      ),
                      if (mechanic != null)
                        IconButton(
                          tooltip: context.l10n.unassigned,
                          onPressed: enabled
                              ? () => setState(() {
                                  mechanic = null;
                                  dirty = true;
                                })
                              : null,
                          icon: const Icon(Icons.close),
                        ),
                    ],
                  ),
                  const SizedBox(height: Space.md),
                  PillButton(
                    label: context.l10n.assignMechanic,
                    icon: Icons.person_search_outlined,
                    kind: PillKind.secondary,
                    onPressed: enabled
                        ? () async {
                            final selected = await openPage<Mechanic>(
                              context,
                              MechanicPicker(
                                repository: widget.repository,
                                initial: mechanic?.name,
                              ),
                            );
                            if (selected != null && mounted) {
                              setState(() {
                                mechanic = selected;
                                dirty = true;
                              });
                            }
                          }
                        : null,
                  ),
                ],
              ),
            ),
            const SizedBox(height: Space.md),
            TextFormField(
              controller: notes,
              enabled: enabled,
              maxLines: 3,
              maxLength: 1000,
              decoration: areaDecoration(
                context,
                label: context.l10n.customerNotes,
              ),
            ),
          ],
        ),
      ),
      footer: !writable
          ? null
          : Row(
              children: [
                PillButton(
                  label: context.l10n.cancel,
                  kind: PillKind.secondary,
                  onPressed: busy ? null : () => Navigator.maybePop(context),
                ),
                SizedBox(width: 8),
                Expanded(
                  child: SaveButton(
                    label: context.l10n.createAppointment,
                    icon: Icons.check,
                    onPressed: save,
                    busy: busy,
                  ),
                ),
              ],
            ),
    );
  }
}

class _DayPill extends StatelessWidget {
  const _DayPill({required this.day, required this.selected, this.onTap});
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
            width: 64,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  context.weekday(day),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: selected ? p.onBrand : p.secondary,
                  ),
                ),
                Text('${day.day}', style: context.numeral(24, color: fg)),
                Text(
                  context.monthShort(day),
                  maxLines: 1,
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
