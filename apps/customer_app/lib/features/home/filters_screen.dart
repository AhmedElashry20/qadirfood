// شاشة ١٢: الفلاتر والفرز
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../providers/restaurants_provider.dart';
import '../../widgets/common.dart';

/// الفلاتر والترتيب — شاشة كاملة بزر رجوع.
class FiltersScreen extends ConsumerWidget {
  const FiltersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filters = ref.watch(filtersProvider);
    final notifier = ref.read(filtersProvider.notifier);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: QHeader(
        title: 'الفلاتر والترتيب',
        trailing: InkWell(
          onTap: notifier.reset,
          borderRadius: BorderRadius.circular(QRadius.sm),
          child: const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Text(
              'مسح',
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: QColors.gold,
              ),
            ),
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(QSpace.screenH),
        children: [
          const _SectionLabel('الترتيب'),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in SortBy.values)
                QChip(
                  label: s.ar,
                  selected: filters.sortBy == s,
                  onTap: () => notifier.setSort(s),
                ),
            ],
          ),
          const SizedBox(height: 16),
          const _SectionLabel('خيارات'),
          const SizedBox(height: 10),
          QTileGroup(
            children: [
              _SwitchRow(
                title: 'توصيل مجاني',
                value: filters.freeDeliveryOnly,
                onChanged: (_) => notifier.toggleFreeDelivery(),
              ),
              _SwitchRow(
                title: 'أقل من 30 دقيقة',
                value: filters.under30Minutes,
                onChanged: (_) => notifier.toggleUnder30(),
              ),
              _SwitchRow(
                title: 'مفتوح الآن',
                value: filters.openNowOnly,
                onChanged: (_) => notifier.toggleOpenNow(),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const _SectionLabel('التقييم'),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              QChip(
                label: '4★ فأعلى',
                selected: filters.minRating == 4.0,
                onTap: () => notifier.toggleMinRating(4.0),
              ),
              QChip(
                label: '4.5★ فأعلى',
                selected: filters.minRating == 4.5,
                onTap: () => notifier.toggleMinRating(4.5),
              ),
            ],
          ),
        ],
      ),
      bottomNavigationBar: QBottomBar(
        child: QButton(label: 'عرض النتائج', onPressed: () => context.pop()),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(
        fontFamily: 'Cairo',
        fontSize: 12,
        fontWeight: FontWeight.w800,
        color: QColors.faint,
      ),
    );
  }
}

class _SwitchRow extends StatelessWidget {
  const _SwitchRow({required this.title, required this.value, required this.onChanged});

  final String title;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Text(
            title,
            style: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: QColors.ink,
            ),
          ),
          const Spacer(),
          QSwitch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}
