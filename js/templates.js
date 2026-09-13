/**
 * templates.js
 * Sample Schemas for ADAPT Conceptual Schema Builder.
 * Primary sample schema is 'car_sale'.
 */

import { LINK_TYPES, NODE_TYPES, DATA_KINDS, NATURE_TYPES, UPDATE_TYPES } from './schema-model.js';

export const SAMPLE_SCHEMAS = {
  car_sale: {
    name: 'car_sale',
    description: 'Car Sales Conceptual Model with multi-level ADAT (sale, Base_Price, Tax, Insurance, Perfomance, service) and PAN hierarchies (Car, Budget, Luxury, customer, state).',
    nodes: [
      {
        id: 'pan_product',
        type: NODE_TYPES.PAN,
        name: 'Car',
        attributes: [
          { id: 'pan_attr_name', name: 'Model', updateType: UPDATE_TYPES.NO_UPDATE }
        ],
        x: 60,
        y: 1100,
        width: 250,
        height: 133
      },
      {
        id: 'pan_non_perishable',
        type: NODE_TYPES.PAN,
        name: 'Budget',
        attributes: [
          { id: 'pan_attr_np_1', name: 'No_of_gears', updateType: UPDATE_TYPES.NO_UPDATE },
          { id: 'pan_attr_mtww3zr0_7gku', name: 'consumption', updateType: UPDATE_TYPES.NO_UPDATE }
        ],
        x: 20,
        y: 660,
        width: 250,
        height: 169
      },
      {
        id: 'pan_perishable',
        type: NODE_TYPES.PAN,
        name: 'Luxury',
        attributes: [
          { id: 'pan_attr_p_1', name: 'length', updateType: UPDATE_TYPES.NO_UPDATE },
          { id: 'pan_attr_mtww4rwv_llng', name: 'Music_System', updateType: UPDATE_TYPES.NO_UPDATE }
        ],
        x: 20,
        y: 890,
        width: 250,
        height: 169
      },
      {
        id: 'adat_sale',
        type: NODE_TYPES.ADAT,
        name: 'sale',
        nature: NATURE_TYPES.STRUCTURED,
        attributes: [
          { id: 'attr_value', name: 'ex_showroom_price', dataKind: DATA_KINDS.NUMERIC }
        ],
        x: 380,
        y: 310,
        width: 250,
        height: 208
      },
      {
        id: 'adat_mtwvzini_9r6d',
        type: NODE_TYPES.ADAT,
        name: 'Base_Price',
        nature: NATURE_TYPES.STRUCTURED,
        attributes: [
          { id: 'attr_mtww016a_w674', name: 'Base_amount', dataKind: DATA_KINDS.NUMERIC }
        ],
        x: 660,
        y: 720,
        width: 250,
        height: 208
      },
      {
        id: 'adat_mtwvzinz_r2zv',
        type: NODE_TYPES.ADAT,
        name: 'Tax',
        nature: NATURE_TYPES.STRUCTURED,
        attributes: [
          { id: 'attr_mtww0pfz_hbz7', name: 'Tax_amount', dataKind: DATA_KINDS.NUMERIC }
        ],
        x: 410,
        y: 950,
        width: 250,
        height: 208
      },
      {
        id: 'adat_mtww1402_vwmh',
        type: NODE_TYPES.ADAT,
        name: 'Insurance',
        nature: NATURE_TYPES.STRUCTURED,
        attributes: [
          { id: 'attr_mtww1e1p_rc2h', name: 'Premium', dataKind: DATA_KINDS.NUMERIC }
        ],
        x: 390,
        y: 720,
        width: 250,
        height: 208
      },
      {
        id: 'pan_mtwwihqx_eluz',
        type: NODE_TYPES.PAN,
        name: 'Individual',
        attributes: [
          { id: 'pan_attr_mtwwlv3t_vhch', name: 'address', updateType: UPDATE_TYPES.NO_UPDATE }
        ],
        x: 1190,
        y: 500,
        width: 250,
        height: 133
      },
      {
        id: 'pan_mtwwihr7_yfyg',
        type: NODE_TYPES.PAN,
        name: 'customer',
        attributes: [
          { id: 'pan_attr_mtwwimff_r4bx', name: 'name', updateType: UPDATE_TYPES.NO_UPDATE }
        ],
        x: 850,
        y: 520,
        width: 250,
        height: 133
      },
      {
        id: 'pan_mtwwj0rh_wucc',
        type: NODE_TYPES.PAN,
        name: 'Corporate',
        attributes: [
          { id: 'pan_attr_mtwwj9yp_7gi3', name: 'type', updateType: UPDATE_TYPES.UPDATE }
        ],
        x: 820,
        y: 300,
        width: 250,
        height: 133
      },
      {
        id: 'pan_mtwwj0rq_pstk',
        type: NODE_TYPES.PAN,
        name: 'Professional',
        attributes: [
          { id: 'pan_attr_mtwwjngm_7291', name: 'Profession', updateType: UPDATE_TYPES.UPDATE },
          { id: 'pan_attr_mtwwjtfl_x5xj', name: 'Agency', updateType: UPDATE_TYPES.UPDATE }
        ],
        x: 1220,
        y: 670,
        width: 250,
        height: 169
      },
      {
        id: 'pan_mtwwoisi_41vh',
        type: NODE_TYPES.PAN,
        name: 'state',
        attributes: [
          { id: 'pan_attr_mtwwp6cw_juyu', name: 'statename', updateType: UPDATE_TYPES.NO_UPDATE }
        ],
        x: 840,
        y: 80,
        width: 250,
        height: 133
      },
      {
        id: 'pan_mtwwoisx_jd8l',
        type: NODE_TYPES.PAN,
        name: 'city',
        attributes: [
          { id: 'pan_attr_mtwwoxii_5rj7', name: 'cityName', updateType: UPDATE_TYPES.NO_UPDATE }
        ],
        x: 1260,
        y: 310,
        width: 250,
        height: 133
      },
      {
        id: 'adat_mtzgh110_42ac',
        type: NODE_TYPES.ADAT,
        name: 'Perfomance',
        nature: NATURE_TYPES.STRUCTURED,
        attributes: [
          { id: 'attr_mtzgh48d_l0t9', name: 'no_sold', dataKind: DATA_KINDS.NUMERIC }
        ],
        x: 420,
        y: 20,
        width: 250,
        height: 208
      },
      {
        id: 'adat_mtzgva06_29n8',
        type: NODE_TYPES.ADAT,
        name: 'service',
        nature: NATURE_TYPES.STRUCTURED,
        attributes: [
          { id: 'attr_mtzgvnpg_srwu', name: 'service_amt', dataKind: DATA_KINDS.NUMERIC }
        ],
        x: 30,
        y: 290,
        width: 250,
        height: 208
      }
    ],
    edges: [
      {
        id: 'edge_mtww20ea_qoy0',
        sourceId: 'adat_mtwvzini_9r6d',
        targetId: 'adat_sale',
        linkType: LINK_TYPES.DISJOINT_D,
        adatMultiplicity: '',
        panMultiplicity: '',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'top',
        targetAnchor: 'bottom',
        waypoint: null
      },
      {
        id: 'edge_mtww24qj_sqbt',
        sourceId: 'adat_mtwvzinz_r2zv',
        targetId: 'adat_sale',
        linkType: LINK_TYPES.DISJOINT_D,
        adatMultiplicity: '',
        panMultiplicity: '',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'top',
        targetAnchor: 'bottom',
        waypoint: null
      },
      {
        id: 'edge_mtww27xv_2x3a',
        sourceId: 'adat_mtww1402_vwmh',
        targetId: 'adat_sale',
        linkType: LINK_TYPES.DISJOINT_D,
        adatMultiplicity: '',
        panMultiplicity: '',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'top',
        targetAnchor: 'bottom',
        waypoint: null
      },
      {
        id: 'edge_mtww6ioo_g8me',
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
        id: 'edge_mtww6ko2_88we',
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
        id: 'edge_mtwwaa4r_6jvs',
        sourceId: 'adat_sale',
        targetId: 'pan_non_perishable',
        linkType: LINK_TYPES.SOLID,
        adatMultiplicity: 'many',
        panMultiplicity: 'one',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'right',
        targetAnchor: 'left',
        waypoint: null
      },
      {
        id: 'edge_mtwwadks_ui2b',
        sourceId: 'adat_sale',
        targetId: 'pan_perishable',
        linkType: LINK_TYPES.SOLID,
        adatMultiplicity: 'many',
        panMultiplicity: 'one',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'right',
        targetAnchor: 'left',
        waypoint: null
      },
      {
        id: 'edge_mtwwnzrq_a1al',
        sourceId: 'pan_mtwwj0rh_wucc',
        targetId: 'pan_mtwwihr7_yfyg',
        linkType: LINK_TYPES.UML_INHERITANCE,
        adatMultiplicity: '',
        panMultiplicity: '',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'right',
        targetAnchor: 'left',
        waypoint: null
      },
      {
        id: 'edge_mtwwo24q_h2ss',
        sourceId: 'pan_mtwwihqx_eluz',
        targetId: 'pan_mtwwihr7_yfyg',
        linkType: LINK_TYPES.UML_INHERITANCE,
        adatMultiplicity: '',
        panMultiplicity: '',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'right',
        targetAnchor: 'left',
        waypoint: null
      },
      {
        id: 'edge_mtwwo4br_iq1u',
        sourceId: 'pan_mtwwj0rq_pstk',
        targetId: 'pan_mtwwihr7_yfyg',
        linkType: LINK_TYPES.UML_INHERITANCE,
        adatMultiplicity: '',
        panMultiplicity: '',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'right',
        targetAnchor: 'left',
        waypoint: null
      },
      {
        id: 'edge_mtwwphdz_d7mr',
        sourceId: 'pan_mtwwoisx_jd8l',
        targetId: 'pan_mtwwoisi_41vh',
        linkType: LINK_TYPES.COMPLETE_C,
        adatMultiplicity: '',
        panMultiplicity: '',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'top',
        targetAnchor: 'bottom',
        waypoint: null
      },
      {
        id: 'edge_mtwwpnhf_9f90',
        sourceId: 'adat_sale',
        targetId: 'pan_mtwwoisi_41vh',
        linkType: LINK_TYPES.SOLID,
        adatMultiplicity: 'many',
        panMultiplicity: 'one',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'bottom',
        targetAnchor: 'top',
        waypoint: null
      },
      {
        id: 'edge_mtwyvumn_4rmr',
        sourceId: 'adat_sale',
        targetId: 'pan_mtwwihr7_yfyg',
        linkType: LINK_TYPES.SOLID,
        adatMultiplicity: 'many',
        panMultiplicity: 'one',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'right',
        targetAnchor: 'top',
        waypoint: null
      },
      {
        id: 'edge_mtzgi5ub_420r',
        sourceId: 'adat_sale',
        targetId: 'adat_mtzgh110_42ac',
        linkType: LINK_TYPES.AGGREGATION_DIAMOND,
        adatMultiplicity: '',
        panMultiplicity: '',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'top',
        targetAnchor: 'bottom',
        waypoint: null
      },
      {
        id: 'edge_mtzgw8hd_d4zd',
        sourceId: 'adat_mtzgva06_29n8',
        targetId: 'adat_mtzgh110_42ac',
        linkType: LINK_TYPES.AGGREGATION_DIAMOND,
        adatMultiplicity: '',
        panMultiplicity: '',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'right',
        targetAnchor: 'left',
        waypoint: null
      },
      {
        id: 'edge_mtzgyar3_wjg8',
        sourceId: 'adat_mtzgva06_29n8',
        targetId: 'pan_non_perishable',
        linkType: LINK_TYPES.SOLID,
        adatMultiplicity: 'many',
        panMultiplicity: 'one',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'right',
        targetAnchor: 'left',
        waypoint: null
      },
      {
        id: 'edge_mtzgzdcz_vgad',
        sourceId: 'adat_mtzgva06_29n8',
        targetId: 'pan_perishable',
        linkType: LINK_TYPES.SOLID,
        adatMultiplicity: 'many',
        panMultiplicity: 'one',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'right',
        targetAnchor: 'left',
        waypoint: null
      }
    ]
  },
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
        name: 'non_perishable',
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
        adatMultiplicity: 'many',
        panMultiplicity: 'many',
        additivity: 'True',
        applicability: 'True',
        sourceAnchor: 'right',
        targetAnchor: 'left',
        waypoint: null
      }
    ]
  }
};
