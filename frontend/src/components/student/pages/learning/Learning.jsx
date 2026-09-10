import React from 'react';
import LoadingRoadmap from './LoadingRoadmap';
import GeneratingRoadmap from './GeneratingRoadmap';
import EmptyRoadmapState from './EmptyRoadmapState';
import RoadmapTimeline from './RoadmapTimeline';

const Learning = ({
  isLoadingRoadmap,
  isGeneratingRoadmap,
  roadmapPlan,
  handleGenerateRoadmap,
  handleToggleTask
}) => {
  if (isLoadingRoadmap) {
    return <LoadingRoadmap />;
  }

  if (isGeneratingRoadmap) {
    return <GeneratingRoadmap />;
  }

  if (!roadmapPlan) {
    return <EmptyRoadmapState handleGenerateRoadmap={handleGenerateRoadmap} />;
  }

  return (
    <div className="dashboard-content-page">
      <RoadmapTimeline 
        roadmapPlan={roadmapPlan}
        handleGenerateRoadmap={handleGenerateRoadmap}
        handleToggleTask={handleToggleTask}
      />
    </div>
  );
};

export default Learning;