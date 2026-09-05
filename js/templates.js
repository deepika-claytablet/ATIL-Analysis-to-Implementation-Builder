/**
 * templates.js
 * Sample Schemas for ADAPT Conceptual Schema Builder.
 * The primary sample schema is 'sale'.
 */

import { LINK_TYPES, NODE_TYPES, DATA_KINDS, NATURE_TYPES, UPDATE_TYPES } from './schema-model.js';

export const SAMPLE_SCHEMAS = {
  sale: {
    name: 'sale',
    description: 'Sample Retail Sales Conceptual Model with ADAT sale and Product hierarchy.',
    nodes: [
      {
        id: 'pan_product',
        type: NODE_TYPES.PAN,
        name: 'Product',
        attributes: [
          { id: 'pan_attr_name', name: 'name', updateType: UPDATE_TYPES.UPDATE },
          { id: 'pan_attr_color', name: 'color', updateType: UPDATE_TYPES.NO_UPDATE }
        ],
        x: 800,
        y: 40,
        width: 250,
        height: 160
      },
      {
        id: 'pan_non_perishable',
        type: NODE_TYPES.PAN,
        name: 'non perishable',
        attributes: [
          { id: 'pan_attr_np_1', name: 'attr_1', updateType: UPDATE_TYPES.NO_UPDATE }
        ],
        x: 650,
        y: 300,
        width: 250,
        height: 130
      },
      {
        id: 'pan_perishable',
        type: NODE_TYPES.PAN,
        name: 'Perishable',
        attributes: [
          { id: 'pan_attr_p_1', name: 'attr_1', updateType: UPDATE_TYPES.NO_UPDATE }
        ],
        x: 950,
        y: 300,
        width: 250,
        height: 130
      },
      {
        id: 'adat_sale',
        type: NODE_TYPES.ADAT,
        name: 'sale',
        nature: NATURE_TYPES.STRUCTURED,
        attributes: [
          { id: 'attr_value', name: 'value', dataKind: DATA_KINDS.NUMERIC }
        ],
        x: 200,
        y: 40,
        width: 250,
        height: 170
      }
    ],
    edges: [
      {
        id: 'edge_np_product',
        sourceId: 'pan_non_perishable',
        targetId: 'pan_product',
        linkType: LINK_TYPES.UML_INHERITANCE,
        adatMultiplicity: '',
        panMultiplicity: '',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'top',
        targetAnchor: 'bottom',
        waypoint: null
      },
      {
        id: 'edge_p_product',
        sourceId: 'pan_perishable',
        targetId: 'pan_product',
        linkType: LINK_TYPES.UML_INHERITANCE,
        adatMultiplicity: '',
        panMultiplicity: '',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'top',
        targetAnchor: 'bottom',
        waypoint: null
      },
      {
        id: 'edge_sale_product',
        sourceId: 'adat_sale',
        targetId: 'pan_product',
        linkType: LINK_TYPES.SOLID,
        adatMultiplicity: '*',
        panMultiplicity: '*',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'right',
        targetAnchor: 'left',
        waypoint: null
      }
    ]
  }
};
