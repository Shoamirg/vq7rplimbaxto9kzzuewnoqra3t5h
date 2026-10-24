import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/api_client.dart';
import '../data/repository.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../domain/models.dart';
import '../domain/portal.dart';
import '../l10n/l10n.dart';
import 'billing.dart';
import 'booking.dart';
import 'chat.dart' show Initials;
import 'work_detail.dart';

class CustomerList extends StatefulWidget {
  const CustomerList({
    super.key,
    required this.repository,
    this.pick = false,
    this.refreshKey = 0,
  });
  final GarageRepository repository;
  final bool pick;
  final int refreshKey;
  @override
  State<CustomerList> createState() => _CustomerListState();
}

class _CustomerListState extends State<CustomerList> {
  String query = '';
  int localRefresh = 0;
  final search = TextEditingController();
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  void updateSearch(String value) {
    if (query == value) return;
    setState(() => query = value);
  }

  Future<void> create() async {
    final customer = await openPage<Customer>(
      context,
      CustomerForm(repository: widget.repository),
    );
    if (!mounted) return;
    if (widget.pick && customer != null) {
      Navigator.pop(context, customer);
    } else {
      setState(() => localRefresh++);
    }
  }

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: BoxConstraints(maxWidth: Space.contentWidth),
      child: InfiniteList<Customer>(
        storageKey: widget.pick ? 'customer-picker' : 'staff-customer-list',
        filterKey: query,
        refreshKey: (widget.repository, widget.refreshKey, localRefresh),
        load: (page) =>
            widget.repository.customers(query: query, page: page),
        header: (data, reload, loading) => [
          Row(
            children: [
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    widget.pick
                        ? context.l10n.selectCustomer
                        : context.l10n.customers,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ),
              ),
              if (widget.repository.canWrite)
                Flexible(
                  child: PillButton(
                    label: context.l10n.newCustomer,
                    icon: Icons.person_add_alt,
                    onPressed: create,
                  ),
                ),
            ],
          ),
          const SizedBox(height: Space.grid),
          ListSearchField(
            controller: search,
            label: context.l10n.searchCustomers,
            hint: context.l10n.customerSearchHint,
            onSearch: updateSearch,
          ),
          const SizedBox(height: Space.md),
          Row(
            children: [
              Expanded(
                child: Text(
                  loading && data == null
                      ? context.l10n.customersLoading
                      : data == null
                      ? context.l10n.customersFailed
                      : context.l10n.customerCount(data.total),
                  style: TextStyle(color: context.colors.secondary),
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
        empty: (reload) => EmptyNotice(
          context.l10n.noCustomerFound,
          query.isEmpty
              ? context.l10n.newCustomerHint
              : context.l10n.searchCustomersHint,
          icon: Icons.person_search_outlined,
          action: query.isEmpty
              ? null
              : PillButton(
                  label: context.l10n.clearSearch,
                  icon: Icons.search_off,
                  kind: PillKind.secondary,
                  onPressed: () {
                    search.clear();
                    updateSearch('');
                  },
                ),
        ),
        item: (customer, reload) => CustomerTile(
          customer: customer,
          onTap: () async {
            if (widget.pick) {
              Navigator.pop(context, customer);
              return;
            }
            await openPage(
              context,
              CustomerScreen(repository: widget.repository, customer: customer),
            );
            await reload();
          },
        ),
      ),
    ),
  );
}

class CustomerTile extends StatelessWidget {
  const CustomerTile({super.key, required this.customer, required this.onTap});
  final Customer customer;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => BentoCard(
    padding: const EdgeInsets.all(Space.tile),
    onTap: onTap,
    child: Row(
      children: [
        Initials(customer.name),
        const SizedBox(width: Space.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(customer.name, style: Theme.of(context).textTheme.titleMedium),
              Text(
                formatPhone(customer.phone),
                style: context.mono(color: context.colors.secondary),
              ),
            ],
          ),
        ),
        const SizedBox(width: Space.sm),
        StatusBadge(
          '${customer.vehicleCount}',
          icon: Icons.directions_car_outlined,
          tone: 'neutral',
        ),
        Semantics(
          label: context.l10n.vehicleCount(customer.vehicleCount),
          child: const Icon(Icons.chevron_right),
        ),
      ],
    ),
  );
}

class CustomerPicker extends StatelessWidget {
  const CustomerPicker({super.key, required this.repository});
  final GarageRepository repository;
  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.chooseCustomer,
    demo: repository.isDemo,
    body: CustomerList(repository: repository, pick: true),
  );
}

/// Reception customer card.
class CustomerScreen extends StatefulWidget {
  const CustomerScreen({
    super.key,
    required this.repository,
    required this.customer,
  });
  final GarageRepository repository;
  final Customer customer;
  @override
  State<CustomerScreen> createState() => _CustomerScreenState();
}

class _CustomerScreenState extends State<CustomerScreen> {
  int refresh = 0;

  Future<void> openLogin(CustomerFile file) async {
    final email = await textSheet(
      context,
      title: context.l10n.openAppLogin,
      message: context.l10n.openAppLoginHint,
      label: context.l10n.email,
      confirmLabel: context.l10n.openAppLogin,
      maxLength: 255,
    );
    if (email == null || email.isEmpty || !mounted) return;
    try {
      final login = await widget.repository.openAppLogin(
        file.customer.id,
        email,
      );
      if (!mounted) return;
      setState(() => refresh++);
      await showModalBottomSheet<void>(
        context: context,
        builder: (context) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(Space.page, 0, Space.page, Space.page),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: IconSquare(Icons.key_outlined, tone: 'success'),
                ),
                const SizedBox(height: Space.md),
                Text(
                  context.l10n.appLoginReady,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: Space.md),
                Pair(context.l10n.email, login.email, mono: true),
                Pair(
                  context.l10n.temporaryPassword,
                  login.temporaryPassword,
                  mono: true,
                ),
                const SizedBox(height: Space.md),
                PillButton(
                  label: context.l10n.copyPassword,
                  icon: Icons.copy,
                  expand: true,
                  onPressed: () => copyText(
                    context,
                    login.temporaryPassword,
                    context.l10n.copied,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    } catch (e) {
      if (mounted) toast(context, context.message(failureText(e)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final repository = widget.repository;
    return PageFrame(
      title: widget.customer.name,
      demo: repository.isDemo,
      readOnly: !repository.canWrite,
      body: LoadView<CustomerFile>(
        loadKey: (repository, widget.customer.id, refresh),
        load: () => repository.customerFile(widget.customer),
        builder: (file, reload) {
          final p = context.colors;
          final customer = file.customer;
          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.all(Space.page),
              children: [
                BentoCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Initials(customer.name, size: 56),
                          const SizedBox(width: Space.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  customer.name,
                                  style: Theme.of(context).textTheme.titleLarge,
                                ),
                                SelectableText(
                                  formatPhone(customer.phone),
                                  style: context.mono(color: p.secondary),
                                ),
                                if (file.email != null)
                                  Text(
                                    file.email!,
                                    style: TextStyle(color: p.secondary),
                                  ),
                              ],
                            ),
                          ),
                          if (customer.phone.isNotEmpty)
                            IconButton.filledTonal(
                              tooltip: context.l10n.callCustomer,
                              style: IconButton.styleFrom(
                                minimumSize: const Size(52, 52),
                              ),
                              onPressed: () => callNumber(context, customer.phone),
                              icon: const Icon(Icons.call_outlined),
                            ),
                        ],
                      ),
                      if (file.appLogin != null) ...[
                        const SizedBox(height: Space.md),
                        file.appLogin!
                            ? StatusBadge(
                                context.l10n.appLoginActive,
                                tone: 'success',
                                icon: Icons.phone_iphone,
                              )
                            : StatusBadge(
                                context.l10n.appLoginNone,
                                tone: 'neutral',
                                icon: Icons.phonelink_off,
                              ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: Space.grid),
                BentoGrid(
                  square: false,
                  children: [
                    if (file.lifetimeValue != null)
                      BentoTile(
                        icon: Icons.savings_outlined,
                        tone: 'success',
                        label: context.l10n.lifetimeValue,
                        valueWidget: FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Text(
                            context.money(file.lifetimeValue!),
                            style: context.numeral(20),
                          ),
                        ),
                      ),
                    BentoTile(
                      icon: Icons.directions_car_outlined,
                      label: context.l10n.vehicles,
                      value: '${file.cars.length}',
                    ),
                    if (file.jobs != null)
                      BentoTile(
                        icon: Icons.build_outlined,
                        label: context.l10n.pastJobs,
                        value: '${file.jobs!.length}',
                      ),
                    if (file.bills != null)
                      BentoTile(
                        icon: Icons.receipt_long_outlined,
                        label: context.l10n.invoices,
                        value: '${file.bills!.length}',
                      ),
                  ],
                ),
                SectionTitle(
                  context.l10n.vehicles,
                  trailing: repository.canWrite
                      ? IconButton.filledTonal(
                          tooltip: context.l10n.addVehicle,
                          style: IconButton.styleFrom(
                            minimumSize: const Size(48, 48),
                          ),
                          onPressed: () async {
                            await openPage(
                              context,
                              CarForm(repository: repository, customer: customer),
                            );
                            await reload();
                          },
                          icon: const Icon(Icons.add),
                        )
                      : null,
                ),
                if (file.cars.isEmpty)
                  EmptyNotice(
                    context.l10n.noVehicles,
                    context.l10n.addVehicleHint,
                    icon: Icons.directions_car_outlined,
                  ),
                for (final car in file.cars)
                  Padding(
                    padding: EdgeInsets.only(bottom: Space.md),
                    child: BentoCard(
                      padding: const EdgeInsets.all(Space.tile),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  car.modelLabel,
                                  style: Theme.of(context).textTheme.titleMedium,
                                ),
                              ),
                              Plate(car.plate),
                            ],
                          ),
                          Text(
                            '${car.year} · ${context.km(car.km)}',
                            style: context.mono(size: 13, color: p.secondary),
                          ),
                          if (car.vin != null)
                            Text(
                              'VIN ${car.vin}',
                              style: context.mono(size: 12, color: p.secondary),
                            ),
                          if (repository.canWrite) ...[
                            SizedBox(height: Space.md),
                            PillButton(
                              label: context.l10n.createAppointment,
                              icon: Icons.event_available_outlined,
                              onPressed: () => openPage(
                                context,
                                BookingScreen(
                                  repository: repository,
                                  customer: customer,
                                  car: car,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                if (file.jobs != null && file.jobs!.isNotEmpty) ...[
                  SectionTitle(context.l10n.pastJobs),
                  BentoCard(
                    padding: const EdgeInsets.symmetric(vertical: Space.sm),
                    child: Column(
                      children: [
                        for (final job in file.jobs!)
                          ListTile(
                            minTileHeight: 64,
                            title: Text(job.serviceLabel ?? job.car),
                            subtitle: Text(
                              '${context.date(job.date)} · ${job.time}',
                              style: context.mono(size: 12, color: p.secondary),
                            ),
                            trailing: WorkStatusChip(job.status),
                            onTap: () async {
                              await openPage(
                                context,
                                WorkScreen(repository: repository, work: job),
                              );
                              await reload();
                            },
                          ),
                      ],
                    ),
                  ),
                ],
                if (file.bills != null && file.bills!.isNotEmpty) ...[
                  SectionTitle(context.l10n.invoices),
                  for (final bill in file.bills!)
                    Padding(
                      padding: const EdgeInsets.only(bottom: Space.md),
                      child: BillTile(
                        bill: bill,
                        onTap: () async {
                          await openPage(
                            context,
                            BillScreen(repository: repository, bill: bill),
                          );
                          await reload();
                        },
                      ),
                    ),
                ],
                if (repository.canWrite && file.appLogin != true) ...[
                  const SizedBox(height: Space.group),
                  PillButton(
                    label: context.l10n.openAppLogin,
                    icon: Icons.key_outlined,
                    kind: PillKind.secondary,
                    expand: true,
                    onPressed: () => openLogin(file),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

String? requiredText(String? s) =>
    s == null || s.trim().isEmpty ? 'Bu maydonni toʻldiring.' : null;
String? phoneError(String? s) {
  final text = s?.trim() ?? '';
  final digits = text.replaceAll(RegExp(r'\D'), '');
  return RegExp(r'^\+?[0-9\s\-()]{7,20}$').hasMatch(text) &&
          digits.length >= 7 &&
          digits.length <= 15
      ? null
      : 'Toʻgʻri telefon raqamini kiriting.';
}

class CustomerForm extends StatefulWidget {
  const CustomerForm({super.key, required this.repository});
  final GarageRepository repository;
  @override
  State<CustomerForm> createState() => _CustomerFormState();
}

class _CustomerFormState extends State<CustomerForm> {
  final form = GlobalKey<FormState>(),
      name = TextEditingController(),
      phone = TextEditingController(text: '+998');
  bool busy = false, dirty = false;
  String? error;
  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (!validateForm(form)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final customer = await widget.repository.createCustomer(
        name.text.trim(),
        phone.text.trim(),
      );
      if (!mounted) return;
      toast(context, context.l10n.saved);
      Navigator.pop(context, customer);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.newCustomer,
    demo: widget.repository.isDemo,
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
          TextFormField(
            controller: name,
            enabled: !busy,
            maxLength: 255,
            autofillHints: [AutofillHints.name],
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: context.l10n.fullName,
              prefixIcon: const Icon(Icons.person_outline),
            ),
            validator: (value) => context.validation(requiredText(value)),
            textInputAction: TextInputAction.next,
          ),
          SizedBox(height: Space.md),
          TextFormField(
            controller: phone,
            enabled: !busy,
            keyboardType: TextInputType.phone,
            autofillHints: [AutofillHints.telephoneNumber],
            style: context.mono(size: 16),
            decoration: InputDecoration(
              labelText: context.l10n.phone,
              prefixIcon: const Icon(Icons.phone_outlined),
            ),
            validator: (value) => context.validation(phoneError(value)),
          ),
        ],
      ),
    ),
    footer: Row(
      children: [
        PillButton(
          label: context.l10n.cancel,
          kind: PillKind.secondary,
          onPressed: busy ? null : () => Navigator.maybePop(context),
        ),
        SizedBox(width: 8),
        Expanded(
          child: SaveButton(
            label: context.l10n.save,
            onPressed: save,
            busy: busy,
          ),
        ),
      ],
    ),
  );
}

/// Plates: digits and Latin letters only, upper case.
class _PlateFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) => newValue.copyWith(text: newValue.text.toUpperCase());
}

class CarForm extends StatefulWidget {
  const CarForm({super.key, required this.repository, required this.customer});
  final GarageRepository repository;
  final Customer customer;
  @override
  State<CarForm> createState() => _CarFormState();
}

class _CarFormState extends State<CarForm> {
  final form = GlobalKey<FormState>();
  final plate = TextEditingController(),
      vin = TextEditingController(),
      year = TextEditingController(text: '${DateTime.now().year}'),
      km = TextEditingController(text: '0');
  late Future<List<CarModel>> models = widget.repository.catalog();
  String? modelId, error;
  bool busy = false, dirty = false;
  @override
  void dispose() {
    plate.dispose();
    vin.dispose();
    year.dispose();
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
      final car = await widget.repository.createCar({
        'customer_id': widget.customer.id,
        'vehicle_model_id': modelId,
        'license_plate': plate.text.trim(),
        'year': int.parse(year.text),
        'current_km': int.parse(km.text),
        if (vin.text.trim().isNotEmpty) 'vin': vin.text.trim().toUpperCase(),
      });
      if (!mounted) return;
      toast(context, context.l10n.saved);
      Navigator.pop(context, car);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.addVehicle,
    demo: widget.repository.isDemo,
    hasChanges: dirty,
    isSaving: busy,
    body: FutureBuilder<List<CarModel>>(
      future: models,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return ListView(
            padding: EdgeInsets.all(Space.page),
            children: [
              ErrorNotice(
                failureText(snapshot.error!),
                retry: () => setState(() {
                  models = widget.repository.catalog();
                }),
              ),
            ],
          );
        }
        if (!snapshot.hasData) {
          return const SkeletonPage(layout: SkeletonLayout.detail);
        }
        if (snapshot.data!.isEmpty) {
          return EmptyNotice(
            context.l10n.noVehicleModels,
            context.l10n.modelsHint,
            icon: Icons.directions_car_outlined,
          );
        }
        return Form(
          key: form,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          onChanged: () => setState(() => dirty = true),
          child: ListView(
            padding: EdgeInsets.all(Space.page),
            children: [
              BentoCard(
                padding: const EdgeInsets.all(Space.tile),
                child: Row(
                  children: [
                    Initials(widget.customer.name, size: 40),
                    const SizedBox(width: Space.md),
                    Expanded(
                      child: Text(
                        widget.customer.name,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(height: Space.group),
              if (error != null) ErrorNotice(error!),
              DropdownButtonFormField<String>(
                isExpanded: true,
                initialValue: modelId,
                decoration: InputDecoration(
                  labelText: context.l10n.makeAndModel,
                  prefixIcon: const Icon(Icons.directions_car_outlined),
                ),
                menuMaxHeight: 360,
                borderRadius: BorderRadius.circular(Radii.tile),
                items: snapshot.data!
                    .map(
                      (m) =>
                          DropdownMenuItem(value: m.id, child: Text(m.label)),
                    )
                    .toList(),
                onChanged: busy ? null : (v) => setState(() => modelId = v),
                validator: (value) => context.validation(requiredText(value)),
              ),
              SizedBox(height: Space.md),
              TextFormField(
                controller: plate,
                enabled: !busy,
                textCapitalization: TextCapitalization.characters,
                inputFormatters: [_PlateFormatter()],
                maxLength: 20,
                style: context.mono(size: 18),
                decoration: InputDecoration(
                  labelText: context.l10n.licensePlate,
                  hintText: '01 A 777 AA',
                  prefixIcon: const Icon(Icons.pin_outlined),
                ),
                validator: (v) =>
                    RegExp(r'^[A-Za-z0-9]{2,20}$')
                        .hasMatch((v ?? '').replaceAll(RegExp(r'[\s-]'), ''))
                    ? null
                    : context.l10n.plateError,
              ),
              SizedBox(height: Space.md),
              TextFormField(
                controller: vin,
                enabled: !busy,
                textCapitalization: TextCapitalization.characters,
                inputFormatters: [_PlateFormatter()],
                maxLength: 17,
                style: context.mono(),
                decoration: InputDecoration(
                  labelText: context.l10n.vinOptional,
                  prefixIcon: const Icon(Icons.qr_code_2),
                ),
                validator: (v) {
                  final text = v?.trim() ?? '';
                  return text.isEmpty ||
                          RegExp(r'^[A-HJ-NPR-Z0-9]{11,17}$', caseSensitive: false)
                              .hasMatch(text)
                      ? null
                      : context.l10n.vinError;
                },
              ),
              SizedBox(height: Space.md),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: year,
                      enabled: !busy,
                      keyboardType: TextInputType.number,
                      style: context.mono(size: 16),
                      decoration: InputDecoration(
                        labelText: context.l10n.manufactureYear,
                      ),
                      validator: (v) {
                        final y = int.tryParse(v ?? '');
                        return y != null &&
                                y >= 1900 &&
                                y <= DateTime.now().year + 1
                            ? null
                            : context.l10n.yearError;
                      },
                    ),
                  ),
                  SizedBox(width: Space.md),
                  Expanded(
                    child: TextFormField(
                      controller: km,
                      enabled: !busy,
                      keyboardType: TextInputType.number,
                      style: context.mono(size: 16),
                      decoration: InputDecoration(
                        labelText: context.l10n.odometer,
                        suffixText: 'km',
                      ),
                      validator: (v) {
                        final n = int.tryParse(v ?? '');
                        return n != null && n >= 0 && n <= 2147483647
                            ? null
                            : context.l10n.odometerError;
                      },
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    ),
    footer: FutureBuilder<List<CarModel>>(
      future: models,
      builder: (context, snapshot) => Row(
        children: [
          PillButton(
            label: context.l10n.cancel,
            kind: PillKind.secondary,
            onPressed: busy ? null : () => Navigator.maybePop(context),
          ),
          SizedBox(width: 8),
          Expanded(
            child: SaveButton(
              label: context.l10n.save,
              onPressed: snapshot.hasData && snapshot.data!.isNotEmpty
                  ? save
                  : null,
              busy: busy,
            ),
          ),
        ],
      ),
    ),
  );
}
