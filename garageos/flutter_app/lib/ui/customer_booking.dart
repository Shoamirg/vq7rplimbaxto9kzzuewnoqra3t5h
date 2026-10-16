import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../data/customer_repository.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../l10n/l10n.dart';

class CustomerBookingScreen extends StatefulWidget {
  const CustomerBookingScreen({super.key, required this.repository});
  final CustomerBookingSource repository;

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
  TimeOfDay _time = const TimeOfDay(hour: 10, minute: 0);
  bool _loading = true;
  bool _saving = false;
  String? _error;

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
        _date = _today;
        _vehicleId = vehicles.isEmpty ? null : vehicles.first.id;
        _loading = false;
      });
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = failureText(error);
          _loading = false;
        });
      }
    }
  }

  Future<void> _pickDate() async {
    final today = _today;
    if (today == null) return;
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? today,
      firstDate: today,
      lastDate: today.add(const Duration(days: 365)),
    );
    if (picked != null && mounted) setState(() => _date = picked);
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(context: context, initialTime: _time);
    if (picked != null && mounted) setState(() => _time = picked);
  }

  Future<void> _submit() async {
    if (_saving || !validateForm(_form)) return;
    final vehicleId = _vehicleId;
    final date = _date;
    if (vehicleId == null || date == null) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final result = await widget.repository.bookAppointment(
        vehicleId: vehicleId,
        service: _service.text,
        date: date,
        time: '${_time.hour.toString().padLeft(2, '0')}:${_time.minute.toString().padLeft(2, '0')}',
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
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.bookService,
    isSaving: _saving,
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : _error != null && _today == null
        ? ErrorNotice(_error!, retry: _load)
        : Form(
            key: _form,
            child: ListView(
              padding: EdgeInsets.all(Space.page),
              children: [
                Text(
                  context.l10n.bookingPendingHint,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 20),
                if (_error != null) ...[
                  ErrorNotice(_error!),
                  const SizedBox(height: 12),
                ],
                if (_vehicles.isEmpty)
                  Panel(child: Text(context.l10n.bookingNoVehicles))
                else ...[
                  DropdownButtonFormField<String>(
                    initialValue: _vehicleId,
                    decoration: InputDecoration(labelText: context.l10n.myVehicles),
                    items: [
                      for (final vehicle in _vehicles)
                        DropdownMenuItem(
                          value: vehicle.id,
                          child: Text(vehicle.label, overflow: TextOverflow.ellipsis),
                        ),
                    ],
                    onChanged: _saving
                        ? null
                        : (value) => setState(() => _vehicleId = value),
                    validator: (value) => value == null ? context.l10n.requiredField : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _service,
                    maxLength: 120,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(
                      labelText: context.l10n.bookingService,
                      hintText: context.l10n.bookingServiceHint,
                    ),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? context.l10n.requiredField
                        : null,
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _saving ? null : _pickDate,
                    icon: const Icon(Icons.calendar_month_outlined),
                    label: Text('${context.l10n.bookingDate}: ${context.date(_date!)}'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _saving ? null : _pickTime,
                    icon: const Icon(Icons.schedule),
                    label: Text('${context.l10n.bookingTime}: ${_time.format(context)}'),
                  ),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    onPressed: _saving ? null : _submit,
                    icon: _saving
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send_outlined),
                    label: Text(context.l10n.sendBooking),
                  ),
                ],
              ],
            ),
          ),
  );
}
