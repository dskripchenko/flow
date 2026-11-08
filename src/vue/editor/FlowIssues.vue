<script setup lang="ts">
/** Validation issues; pressing one selects and shows its element. */
import { UidButton } from '@dskripchenko/ui'
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-vue-next'
import type { Graph, Issue } from '../../index'
import { issueMessage, type FlowLabels } from '../labels'

/** `graph` is the level the issues were found in: elements are named from it. */
defineProps<{ issues: readonly Issue[]; graph: Graph; labels: FlowLabels }>()
const emit = defineEmits<{ focus: [issue: Issue] }>()
</script>

<template>
  <div class="fl-issues">
    <p
      v-if="issues.length === 0"
      class="fl-issues__none"
    >
      <CircleCheck
        :size="16"
        aria-hidden="true"
      />
      {{ labels.noIssues }}
    </p>
    <ul
      v-else
      class="fl-issues__list"
    >
      <li
        v-for="(issue, i) in issues"
        :key="i"
      >
        <UidButton
          variant="ghost"
          size="sm"
          class="fl-issue"
          :class="`fl-issue--${issue.severity}`"
          :icon="issue.severity === 'error' ? CircleAlert : TriangleAlert"
          :disabled="!issue.target"
          :data-code="issue.code"
          @click="emit('focus', issue)"
        >
          <span class="fl-issue__text">{{ issueMessage(issue, graph, labels) }}</span>
        </UidButton>
      </li>
    </ul>
  </div>
</template>
