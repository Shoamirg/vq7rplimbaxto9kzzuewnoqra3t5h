import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/api_client.dart';
import '../data/repository.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../domain/models.dart';

class InspectionScreen extends StatefulWidget {
  const InspectionScreen({
    super.key,
    required this.repository,
    required this.work,
  });

  final GarageRepository repository;
  final Work work;

  @override
  State<InspectionScreen> createState() => _InspectionScreenState();
}

class _InspectionScreenState extends State<InspectionScreen> {
  InspectionModel? inspection;
  bool loading = true;
  bool busy = false;
  String? error;
  String filter = 'all';

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final existing = await widget.repository.inspectionForWork(widget.work.id);
      if (mounted) setState(() => inspection = existing);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> createNew() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final created = await widget.repository.createInspection(
        widget.work.vehicleId,
        appointmentId: widget.work.id,
        customerId: widget.work.customerId,
      );
      if (mounted) setState(() => inspection = created);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> updateItemRating(InspectionItemModel item, String rating) async {
    if (inspection == null) return;
    setState(() => busy = true);
    try {
      await widget.repository.updateInspectionItem(
        inspection!.id,
        item.id,
        rating: rating,
      );
      final refreshed = await widget.repository.getInspection(inspection!.id);
      if (mounted) setState(() => inspection = refreshed);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> editItemDetails(InspectionItemModel item) async {
    if (inspection == null) return;
    final noteCtrl = TextEditingController(text: item.notes ?? '');
    final partsCtrl = TextEditingController(
      text: item.estimatedPartsPrice.cents > 0 ? item.estimatedPartsPrice.input('UZS') : '',
    );
    final laborCtrl = TextEditingController(
      text: item.estimatedLaborPrice.cents > 0 ? item.estimatedLaborPrice.input('UZS') : '',
    );

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(item.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: noteCtrl,
                decoration: const InputDecoration(
                  labelText: "Usta izohi / muammo tavsifi",
                  hintText: "Masalan: Tormoz kolodkasi 80% yeyilgan",
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: partsCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: "Ehtiyot qism bahosi (UZS)",
                  hintText: "350 000",
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: laborCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: "O'rnatish / Ish haqi (UZS)",
                  hintText: "150 000",
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Bekor qilish"),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text("Saqlash"),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      setState(() => busy = true);
      try {
        final p = Money.parse(partsCtrl.text) ?? const Money(0);
        final l = Money.parse(laborCtrl.text) ?? const Money(0);
        await widget.repository.updateInspectionItem(
          inspection!.id,
          item.id,
          notes: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
          partsPrice: p,
          laborPrice: l,
        );
        final refreshed = await widget.repository.getInspection(inspection!.id);
        if (mounted) setState(() => inspection = refreshed);
      } catch (e) {
        if (mounted) setState(() => error = failureText(e));
      } finally {
        if (mounted) setState(() => busy = false);
      }
    }
  }

  Future<void> sendToCustomer() async {
    if (inspection == null) return;
    setState(() => busy = true);
    try {
      final res = await widget.repository.sendInspection(inspection!.id);
      final token = res['public_token'] ?? inspection!.publicToken;
      final fullUrl = "https://garageos.uz/inspection/$token";

      if (!mounted) return;
      await showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.check_circle, color: Colors.green),
              SizedBox(width: 8),
              Text("Havola tayyor!"),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                "Ko'rik hisoboti yaratildi va mijozga yuborishga tayyor. Mijoz ushbu havola orqali har bir bandni fotosuratlar bilan ko'radi va ta'mirlashni tasdiqlaydi:",
                style: TextStyle(fontSize: 13),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                child: SelectableText(
                  fullUrl,
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 13, color: Colors.blue),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: fullUrl));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text("Havola nusxalandi!")),
                );
                Navigator.pop(ctx);
              },
              child: const Text("Nusxalash"),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text("Tushunarli"),
            ),
          ],
        ),
      );

      final refreshed = await widget.repository.getInspection(inspection!.id);
      if (mounted) setState(() => inspection = refreshed);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.colors;

    return PageFrame(
      title: "Raqamli ko'rik (DVI)",
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: load,
              child: ListView(
                padding: const EdgeInsets.all(Space.page),
                children: [
                  if (error != null) ...[
                    ErrorNotice(error!, retry: load),
                    const SizedBox(height: Space.md),
                  ],

                  if (inspection == null) ...[
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(Space.page),
                        child: Column(
                          children: [
                            const Icon(Icons.fact_check_outlined, size: 56, color: Colors.amber),
                            const SizedBox(height: Space.md),
                            const Text(
                              "Texnik ko'rik o'tkazilmagan",
                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(height: Space.sm),
                            const Text(
                              "Avtomobil holatini 16 ta muhim parametr bo'yicha baholash, xarajatlar smetasini tuzish va mijozga yuborish uchun tekshiruvni boshlang.",
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 13, color: Colors.grey),
                            ),
                            const SizedBox(height: Space.page),
                            PillButton(
                              label: "Ko'rikni boshlash",
                              icon: Icons.play_arrow_rounded,
                              kind: PillKind.emerald,
                              busy: busy,
                              expand: true,
                              onPressed: createNew,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ] else ...[
                    // Inspection Header Overview
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(Space.md),
                        child: Row(
                          children: [
                            Container(
                              width: 60,
                              height: 60,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: inspection!.overallScore >= 85
                                    ? Colors.green.withValues(alpha: 0.15)
                                    : inspection!.overallScore >= 60
                                        ? Colors.amber.withValues(alpha: 0.15)
                                        : Colors.red.withValues(alpha: 0.15),
                                border: Border.all(
                                  color: inspection!.overallScore >= 85
                                      ? Colors.green
                                      : inspection!.overallScore >= 60
                                          ? Colors.amber
                                          : Colors.red,
                                  width: 3,
                                ),
                              ),
                              child: Center(
                                child: Text(
                                  '${inspection!.overallScore}',
                                  style: TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.bold,
                                    color: inspection!.overallScore >= 85
                                        ? Colors.green
                                        : inspection!.overallScore >= 60
                                            ? Colors.amber.shade800
                                            : Colors.red,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: Space.md),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    widget.work.car,
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    "Status: ${inspection!.status}",
                                    style: TextStyle(fontSize: 12, color: p.secondary),
                                  ),
                                  const SizedBox(height: 6),
                                  Row(
                                    children: [
                                      _countBadge("🔴 ${inspection!.redCount}", Colors.red),
                                      const SizedBox(width: 6),
                                      _countBadge("🟡 ${inspection!.yellowCount}", Colors.amber.shade800),
                                      const SizedBox(width: 6),
                                      _countBadge("🟢 ${inspection!.greenCount}", Colors.green),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: Space.md),

                    // Filter chips
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          _filterChip("Barchasi (${inspection!.items.length})", 'all'),
                          const SizedBox(width: 6),
                          _filterChip("🔴 Xavfli (${inspection!.redCount})", 'red'),
                          const SizedBox(width: 6),
                          _filterChip("🟡 E'tibor (${inspection!.yellowCount})", 'yellow'),
                          const SizedBox(width: 6),
                          _filterChip("🟢 Yaxshi (${inspection!.greenCount})", 'green'),
                        ],
                      ),
                    ),
                    const SizedBox(height: Space.md),

                    // Checklist Items
                    ...inspection!.items
                        .where((it) => filter == 'all' || it.rating == filter)
                        .map((item) => _buildItemCard(item)),
                  ],
                ],
              ),
            ),
      footer: inspection != null
          ? SaveButton(
              label: "Mijozga havola yuborish",
              icon: Icons.share,
              busy: busy,
              kind: PillKind.primary,
              onPressed: sendToCustomer,
            )
          : null,
    );
  }

  Widget _countBadge(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: color)),
    );
  }

  Widget _filterChip(String label, String value) {
    final selected = filter == value;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => setState(() => filter = value),
    );
  }

  Widget _buildItemCard(InspectionItemModel item) {
    final hasEstimate = item.totalEstimate.cents > 0;

    return Card(
      margin: const EdgeInsets.only(bottom: Space.sm),
      child: Padding(
        padding: const EdgeInsets.all(Space.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.category.toUpperCase(),
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.grey.shade600),
                      ),
                      const SizedBox(height: 2),
                      Text(item.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.edit_note, size: 22),
                  onPressed: () => editItemDetails(item),
                  tooltip: "Izoh va narx qo'shish",
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Rating Selector
            Row(
              children: [
                _ratingButton(item, 'green', "Yaxshi", Colors.green),
                const SizedBox(width: 8),
                _ratingButton(item, 'yellow', "E'tibor", Colors.amber.shade700),
                const SizedBox(width: 8),
                _ratingButton(item, 'red', "Xavfli", Colors.red),
              ],
            ),

            if (item.notes != null && item.notes!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  "💬 ${item.notes}",
                  style: const TextStyle(fontSize: 12, fontStyle: FontStyle.italic),
                ),
              ),
            ],

            if (hasEstimate) ...[
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    "Taxminiy ta'mirlash smetasi:",
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                  ),
                  Text(
                    item.totalEstimate.format('UZS'),
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ],

            if (item.customerDecision != 'pending') ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  Icon(
                    item.customerDecision == 'approved' ? Icons.check_circle : Icons.cancel,
                    size: 14,
                    color: item.customerDecision == 'approved' ? Colors.green : Colors.red,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    item.customerDecision == 'approved'
                      ? "Mijoz tasdiqladi"
                      : "Mijoz rad etdi",
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: item.customerDecision == 'approved' ? Colors.green : Colors.red,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _ratingButton(InspectionItemModel item, String rating, String label, Color color) {
    final isSelected = item.rating == rating;
    return Expanded(
      child: InkWell(
        onTap: () => updateItemRating(item, rating),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 6),
          decoration: BoxDecoration(
            color: isSelected ? color : color.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: color, width: isSelected ? 2 : 1),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: isSelected ? Colors.white : color,
            ),
          ),
        ),
      ),
    );
  }
}
